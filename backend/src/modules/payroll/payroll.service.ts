import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { notify } from "../notifications/notifications.service.js";
import { mailService } from "../notifications/mail.service.js";
import { attendanceService } from "../attendance/attendance.service.js";
import { breakupFromCtc, esiEmployee, monthlyTds, pfEmployee, professionalTax, round2, DEFAULT_STATUTORY, type StatutoryConfig } from "./payroll.calc.js";
import { renderPayslipPdf } from "./payslip.pdf.js";
import { storeUpload, fileUrl } from "../files/files.routes.js";
import { getObject } from "../files/storage.js";
import { brandingService } from "../branding/branding.service.js";
import { Prisma } from "../../generated/prisma/client.js";
import { decryptSafe } from "../../core/fieldCrypto.js";
import { formatDate } from "../../shared/format.js";
import type { PayslipEditInput, ManualPayslipInput } from "./payroll.schema.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function componentId(code: string): Promise<string> {
  const comp = await prisma.salaryComponent.findUnique({ where: { code } });
  if (!comp) throw new BadRequestError(`Salary component ${code} missing — run the seed`);
  return comp.id;
}

export const payrollService = {
  /* ---------------- statutory config (DB-driven, replaces hardcoded rates) ---------------- */

  /** Load the active statutory config as a calc-ready object, creating defaults on first use. */
  async statutoryConfig(): Promise<StatutoryConfig> {
    let row = await prisma.payrollStatutoryConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
    if (!row) row = await prisma.payrollStatutoryConfig.create({ data: {} });
    return {
      flatStructure: row.flatStructure,
      basicPercentOfCtc: row.basicPercentOfCtc,
      hraPercentOfBasic: row.hraPercentOfBasic,
      statutoryEnabled: row.statutoryEnabled,
      pfEnabled: row.pfEnabled,
      pfRate: row.pfRate,
      pfWageCap: row.pfWageCap,
      esiEnabled: row.esiEnabled,
      esiRate: row.esiRate,
      esiGrossThreshold: row.esiGrossThreshold,
      ptEnabled: row.ptEnabled,
      ptAmount: row.ptAmount,
      ptGrossThreshold: row.ptGrossThreshold,
      tdsEnabled: row.tdsEnabled,
      tdsStandardDeduction: row.tdsStandardDeduction,
      tdsRebateLimit: row.tdsRebateLimit,
      tdsCessRate: row.tdsCessRate,
      tdsSlabs: (row.tdsSlabs as Array<[number, number, number]> | null) ?? null,
    };
  },

  /** The raw config row (for the admin UI). */
  async getStatutoryConfigRow() {
    let row = await prisma.payrollStatutoryConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
    if (!row) row = await prisma.payrollStatutoryConfig.create({ data: {} });
    return row;
  },

  async updateStatutoryConfig(req: Request, input: Record<string, unknown>) {
    const current = await this.getStatutoryConfigRow();
    const updated = await prisma.payrollStatutoryConfig.update({
      where: { id: current.id },
      data: { ...(input as Record<string, unknown>), tdsSlabs: input["tdsSlabs"] === undefined ? undefined : (input["tdsSlabs"] ?? Prisma.DbNull) as Prisma.InputJsonValue, updatedBy: req.user!.id },
    });
    audit({ action: "payroll.statutory_update", entity: "PayrollStatutoryConfig", entityId: updated.id, before: current, after: updated, req });
    return updated;
  },

  /* ---------------- salary components & structures (DB-driven CRUD) ---------------- */

  async listComponents() {
    return prisma.salaryComponent.findMany({ orderBy: [{ displayOrder: "asc" }, { name: "asc" }] });
  },

  async createComponent(req: Request, input: Record<string, unknown>) {
    const comp = await prisma.salaryComponent.create({ data: input as never });
    audit({ action: "payroll.component_create", entity: "SalaryComponent", entityId: comp.id, after: comp, req });
    return comp;
  },

  async updateComponent(req: Request, id: string, input: Record<string, unknown>) {
    const before = await prisma.salaryComponent.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Salary component");
    const comp = await prisma.salaryComponent.update({ where: { id }, data: input as never });
    audit({ action: "payroll.component_update", entity: "SalaryComponent", entityId: id, before, after: comp, req });
    return comp;
  },

  async createStructure(req: Request, input: { name: string; description?: string | null; componentIds?: string[] }) {
    const structure = await prisma.salaryStructure.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        components: input.componentIds?.length ? { create: input.componentIds.map((componentId) => ({ componentId })) } : undefined,
      },
      include: { components: { include: { component: true } } },
    });
    audit({ action: "payroll.structure_create", entity: "SalaryStructure", entityId: structure.id, after: { name: structure.name }, req });
    return structure;
  },

  async updateStructure(req: Request, id: string, input: { name?: string; description?: string | null; isActive?: boolean; componentIds?: string[] }) {
    const before = await prisma.salaryStructure.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Salary structure");
    const structure = await prisma.$transaction(async (tx) => {
      await tx.salaryStructure.update({
        where: { id },
        data: { name: input.name, description: input.description, isActive: input.isActive },
      });
      if (input.componentIds) {
        await tx.salaryStructureComponent.deleteMany({ where: { structureId: id } });
        if (input.componentIds.length) {
          await tx.salaryStructureComponent.createMany({ data: input.componentIds.map((componentId) => ({ structureId: id, componentId })) });
        }
      }
      return tx.salaryStructure.findUnique({ where: { id }, include: { components: { include: { component: true } } } });
    });
    audit({ action: "payroll.structure_update", entity: "SalaryStructure", entityId: id, before: { name: before.name }, after: { name: input.name }, req });
    return structure;
  },

  /* ---------------- salary assignment & revisions ---------------- */

  async listStructures() {
    return prisma.salaryStructure.findMany({
      where: { isActive: true },
      include: { components: { include: { component: true } } },
    });
  },

  async employeesWithSalary() {
    return prisma.employee.findMany({
      where: { deletedAt: null, status: { in: ["ONBOARDING", "PROBATION", "ACTIVE"] } },
      orderBy: { employeeCode: "asc" },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true,
        department: { select: { name: true } }, designation: { select: { title: true } },
        salaries: {
          where: { isCurrent: true },
          select: { id: true, annualCtc: true, monthlyGross: true, effectiveFrom: true, structure: { select: { name: true } } },
        },
      },
    });
  },

  async setSalary(req: Request, employeeId: string, input: { structureId: string; annualCtc: number; effectiveFrom: Date; reason?: string }) {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
    if (!employee) throw new NotFoundError("Employee");
    const structure = await prisma.salaryStructure.findUnique({ where: { id: input.structureId } });
    if (!structure) throw new NotFoundError("Salary structure");

    const breakup = breakupFromCtc(input.annualCtc, await this.statutoryConfig());
    const [basicId, hraId, saId] = await Promise.all([componentId("BASIC"), componentId("HRA"), componentId("SA")]);

    const current = await prisma.employeeSalary.findFirst({ where: { employeeId, isCurrent: true } });

    const salary = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.employeeSalary.update({
          where: { id: current.id },
          data: { isCurrent: false, effectiveTo: input.effectiveFrom },
        });
        const prevCtc = Number(current.annualCtc);
        await tx.salaryRevision.create({
          data: {
            employeeId,
            previousCtc: prevCtc,
            revisedCtc: input.annualCtc,
            percentHike: prevCtc > 0 ? round2(((input.annualCtc - prevCtc) / prevCtc) * 100) : 0,
            reason: input.reason ?? "REVISION",
            effectiveFrom: input.effectiveFrom,
            status: "APPROVED",
            approvedBy: req.user!.id,
            actedAt: new Date(),
          },
        });
      }
      return tx.employeeSalary.create({
        data: {
          employeeId,
          structureId: structure.id,
          annualCtc: input.annualCtc,
          monthlyGross: breakup.gross,
          effectiveFrom: input.effectiveFrom,
          components: {
            create: [
              { componentId: basicId, monthlyAmount: breakup.basic, annualAmount: round2(breakup.basic * 12) },
              { componentId: hraId, monthlyAmount: breakup.hra, annualAmount: round2(breakup.hra * 12) },
              { componentId: saId, monthlyAmount: breakup.specialAllowance, annualAmount: round2(breakup.specialAllowance * 12) },
            ],
          },
        },
        include: { components: { include: { component: true } } },
      });
    });

    audit({ action: "payroll.salary_set", entity: "EmployeeSalary", entityId: salary.id, after: { employeeId, annualCtc: input.annualCtc }, req });
    return salary;
  },

  async revisions(employeeId?: string) {
    return prisma.salaryRevision.findMany({
      where: employeeId ? { employeeId } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, designation: { select: { title: true } } },
        },
      },
    });
  },

  /* ---------------- payroll runs ---------------- */

  async listRuns() {
    return prisma.payrollRun.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], take: 24 });
  },

  async getRun(id: string) {
    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: {
        payslips: {
          orderBy: { createdAt: "asc" },
          include: {
            employee: {
              select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, department: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!run) throw new NotFoundError("Payroll run");
    return run;
  },

  /** Process a month: every figure derived from live salary + attendance + leave rows. */
  async processRun(req: Request, month: number, year: number) {
    const existing = await prisma.payrollRun.findUnique({ where: { month_year: { month, year } } });
    if (existing && !["DRAFT", "PENDING_APPROVAL"].includes(existing.status)) {
      throw new BadRequestError(`Payroll for ${MONTHS[month - 1]} ${year} is ${existing.status} and locked`);
    }

    const run = existing
      ? await prisma.payrollRun.update({ where: { id: existing.id }, data: { status: "PROCESSING", processedBy: req.user!.id } })
      : await prisma.payrollRun.create({ data: { month, year, status: "PROCESSING", processedBy: req.user!.id } });

    // Auto-generated payslip numbers: ST/<year>/P<running seq>, reused per employee
    // on reprocess so a regenerated payslip keeps its original number.
    const prefix = `ST/${year}/P`;
    const fmtNo = (seq: number) => `${prefix}${String(seq).padStart(3, "0")}`;
    const prior = await prisma.payslip.findMany({ where: { runId: run.id }, select: { employeeId: true, payslipNo: true } });
    const reuse = new Map(prior.filter((p) => p.payslipNo).map((p) => [p.employeeId, p.payslipNo!]));

    // reprocess = wipe previous draft output
    await prisma.payslip.deleteMany({ where: { runId: run.id } });

    // running sequence = max existing number for the year (incl. reused ones, so we never collide)
    const yearSlips = await prisma.payslip.findMany({ where: { year, payslipNo: { startsWith: prefix } }, select: { payslipNo: true } });
    let maxSeq = 0;
    for (const no of [...yearSlips.map((s) => s.payslipNo!), ...reuse.values()]) {
      const n = parseInt(no.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }

    const employees = await prisma.employee.findMany({
      where: { deletedAt: null, status: { in: ["PROBATION", "ACTIVE"] } },
      include: { salaries: { where: { isCurrent: true }, include: { components: { include: { component: true } } } } },
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    const skipped: string[] = [];
    let totalGross = 0, totalDeductions = 0, totalNet = 0, count = 0;

    const ids = {
      BASIC: await componentId("BASIC"), HRA: await componentId("HRA"), SA: await componentId("SA"),
      PF: await componentId("PF"), PT: await componentId("PT"), ESI: await componentId("ESI"), TDS: await componentId("TDS"),
    };
    const cfg = await this.statutoryConfig();

    for (const employee of employees) {
      const salary = employee.salaries[0];
      if (!salary) {
        skipped.push(`${employee.firstName} ${employee.lastName} (no salary assigned)`);
        continue;
      }

      // LOP days = ONLY explicitly recorded absences + unpaid (LOP-type) approved
      // leave. Unmarked days are NOT inferred as absent — salaried staff are paid
      // in full unless an absence/LOP is actually on record.
      const explicitAbsent = await prisma.attendanceRecord.count({
        where: {
          employeeId: employee.id, status: "ABSENT",
          date: { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0) },
        },
      });
      const lopLeave = await prisma.leaveRequest.findMany({
        where: {
          employeeId: employee.id, status: "APPROVED", leaveType: { code: "LOP" },
          startDate: { lte: new Date(year, month, 0) }, endDate: { gte: new Date(year, month - 1, 1) },
        },
        select: { days: true },
      });
      const lopDays = Math.min(daysInMonth, explicitAbsent + lopLeave.reduce((s, l) => s + l.days, 0));
      const paidDays = round2(daysInMonth - lopDays);
      const prorate = paidDays / daysInMonth;

      const comp = (cid: string) => Number(salary.components.find((c) => c.componentId === cid)?.monthlyAmount ?? 0);
      // fall back to the flat monthlyGross when a salary has no component breakdown
      const flat = salary.components.length === 0;
      const basic = round2((flat ? Number(salary.monthlyGross) : comp(ids.BASIC)) * prorate);
      const hra = round2((flat ? 0 : comp(ids.HRA)) * prorate);
      const sa = round2((flat ? 0 : comp(ids.SA)) * prorate);
      const gross = round2(basic + hra + sa);

      const pf = cfg.statutoryEnabled ? pfEmployee(basic, cfg) : 0;
      const pt = cfg.statutoryEnabled ? professionalTax(gross, cfg) : 0;
      const esi = cfg.statutoryEnabled ? esiEmployee(gross, cfg) : 0;
      const tds = cfg.statutoryEnabled ? monthlyTds(Number(salary.annualCtc), cfg) : 0;
      const deductions = round2(pf + pt + esi + tds);
      const net = round2(gross - deductions);

      const payslipNo = reuse.get(employee.id) ?? fmtNo(++maxSeq);
      await prisma.payslip.create({
        data: {
          runId: run.id, employeeId: employee.id, month, year, payslipNo,
          workingDays: daysInMonth, paidDays, lopDays,
          grossEarnings: gross, totalDeductions: deductions, netPay: net,
          lines: {
            create: [
              { componentId: ids.BASIC, type: "EARNING", label: "Basic Salary", amount: basic, displayOrder: 1 },
              { componentId: ids.HRA, type: "EARNING", label: "House Rent Allowance", amount: hra, displayOrder: 2 },
              { componentId: ids.SA, type: "EARNING", label: "Special Allowance", amount: sa, displayOrder: 3 },
              { componentId: ids.PF, type: "DEDUCTION", label: "Provident Fund", amount: pf, displayOrder: 10 },
              { componentId: ids.PT, type: "DEDUCTION", label: "Professional Tax", amount: pt, displayOrder: 11 },
              { componentId: ids.ESI, type: "DEDUCTION", label: "ESI", amount: esi, displayOrder: 12 },
              { componentId: ids.TDS, type: "DEDUCTION", label: "TDS", amount: tds, displayOrder: 13 },
            ],
          },
        },
      });
      totalGross += gross; totalDeductions += deductions; totalNet += net; count += 1;
    }

    const done = await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: "PENDING_APPROVAL", processedAt: new Date(),
        totalGross: round2(totalGross), totalDeductions: round2(totalDeductions), totalNet: round2(totalNet),
        employeeCount: count,
        remarks: skipped.length ? `Skipped ${skipped.length} employee${skipped.length === 1 ? "" : "s"} without a current salary` : null,
      },
    });
    audit({ action: "payroll.run_processed", entity: "PayrollRun", entityId: run.id, after: { month, year, count, totalNet: done.totalNet }, req });
    return done;
  },

  /** Approve = lock + publish payslips + notify + email PDFs. */
  async approveRun(req: Request, id: string) {
    const run = await this.getRun(id);
    if (run.status !== "PENDING_APPROVAL") throw new BadRequestError(`Run is ${run.status} — only PENDING_APPROVAL runs can be approved`);

    await prisma.$transaction([
      prisma.payrollRun.update({ where: { id }, data: { status: "APPROVED", approvedBy: req.user!.id, approvedAt: new Date() } }),
      prisma.payslip.updateMany({ where: { runId: id }, data: { status: "PUBLISHED", publishedAt: new Date() } }),
    ]);
    audit({ action: "payroll.run_approved", entity: "PayrollRun", entityId: id, req });

    const period = `${MONTHS[run.month - 1]} ${run.year}`;
    for (const slip of run.payslips) {
      const user = await prisma.user.findFirst({ where: { employee: { id: slip.employeeId } }, select: { id: true, email: true } });
      if (!user) continue;
      await notify({
        userId: user.id, type: "SUCCESS",
        title: `Payslip published — ${period}`,
        body: `Net pay ₹${Number(slip.netPay).toLocaleString("en-IN")}. Download it from Payslips.`,
        link: "/payslips",
      });
      try {
        const pdf = await this.payslipPdf(req, slip.id, true);
        await mailService.sendPayslip(user.email, slip.employee.firstName, period, pdf);
      } catch { /* mail failures must not block publication */ }
    }
    return prisma.payrollRun.findUnique({ where: { id } });
  },

  async markPaid(req: Request, id: string) {
    const run = await prisma.payrollRun.findUnique({ where: { id } });
    if (!run || run.status !== "APPROVED") throw new BadRequestError("Only approved runs can be marked paid");
    const updated = await prisma.payrollRun.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
    audit({ action: "payroll.run_paid", entity: "PayrollRun", entityId: id, req });
    return updated;
  },

  /* ---------------- payslips ---------------- */

  async myPayslips(req: Request) {
    if (!req.user?.employeeId) throw new ForbiddenError("No employee profile linked");
    return prisma.payslip.findMany({
      where: { employeeId: req.user.employeeId, status: "PUBLISHED" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: { lines: { orderBy: { displayOrder: "asc" } } },
    });
  },

  async allPayslips(month?: number, year?: number) {
    const where: Record<string, unknown> = {};
    if (year) where.year = year;
    if (month) where.month = month;
    return prisma.payslip.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 500,
      include: {
        lines: { orderBy: { displayOrder: "asc" } },
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, department: { select: { name: true } } } },
      },
    });
  },

  /** Import a single historical payslip PDF (pre-HRMS). Mirrors the bulk importer. */
  async importSinglePayslip(
    req: Request,
    input: { employeeId: string; month: number; year: number; netPay?: number; grossEarnings?: number; totalDeductions?: number },
    file: Express.Multer.File
  ) {
    const emp = await prisma.employee.findFirst({ where: { id: input.employeeId, deletedAt: null }, select: { id: true } });
    if (!emp) throw new NotFoundError("Employee");
    const dup = await prisma.payslip.findUnique({ where: { employeeId_month_year: { employeeId: input.employeeId, month: input.month, year: input.year } } });
    if (dup) throw new BadRequestError(`A payslip for ${MONTHS[input.month - 1]} ${input.year} already exists for this employee`);

    const stored = await storeUpload(file);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true, employee: { select: { firstName: true, lastName: true } } } });
    const importedByName = user?.employee ? `${user.employee.firstName} ${user.employee.lastName}` : (user?.email ?? null);

    const batch = await prisma.importBatch.create({
      data: { type: "payslip", fileName: file.originalname, status: "COMPLETED", totalRows: 1, successCount: 1, importedBy: req.user!.id, importedByName, summary: { payslipsCreated: 1 } as object },
    });
    const slip = await prisma.payslip.create({
      data: {
        employeeId: input.employeeId,
        month: input.month,
        year: input.year,
        workingDays: 0,
        paidDays: 0,
        grossEarnings: input.grossEarnings ?? 0,
        totalDeductions: input.totalDeductions ?? 0,
        netPay: input.netPay ?? 0,
        status: "PUBLISHED",
        source: "IMPORTED",
        publishedAt: new Date(),
        pdfUrl: fileUrl(stored),
        sourceFileName: file.originalname,
        importBatchId: batch.id,
      },
    });
    audit({ action: "payroll.payslip_import_single", entity: "Payslip", entityId: slip.id, after: { month: input.month, year: input.year, fileName: file.originalname }, req });
    return slip;
  },

  async replacePayslipPdf(req: Request, payslipId: string, file: Express.Multer.File) {
    const slip = await prisma.payslip.findUnique({ where: { id: payslipId }, select: { id: true, pdfUrl: true, employeeId: true, month: true, year: true, source: true } });
    if (!slip) throw new NotFoundError("Payslip");

    const previousPdfUrl = slip.pdfUrl;
    const stored = await storeUpload(file);
    const newPdfUrl = fileUrl(stored);

    const updated = await prisma.payslip.update({
      where: { id: payslipId },
      data: {
        pdfUrl: newPdfUrl,
        sourceFileName: file.originalname,
        editedBy: req.user!.id,
        editedAt: new Date(),
      },
    });

    audit({
      action: "payroll.payslip_replace_pdf",
      entity: "Payslip",
      entityId: payslipId,
      before: { pdfUrl: previousPdfUrl },
      after: { pdfUrl: newPdfUrl, fileName: file.originalname, replacedBy: req.user!.id, replacedAt: new Date().toISOString() },
      req,
    });

    return updated;
  },

  async deletePayslip(req: Request, payslipId: string) {
    const slip = await prisma.payslip.findUnique({ where: { id: payslipId }, select: { id: true, employeeId: true, month: true, year: true } });
    if (!slip) throw new NotFoundError("Payslip");
    await prisma.payslipLine.deleteMany({ where: { payslipId } });
    await prisma.payslip.delete({ where: { id: payslipId } });
    audit({ action: "payroll.payslip_delete", entity: "Payslip", entityId: payslipId, before: slip, req });
    return { deleted: true };
  },

  /** Payslip with raw lines + meta — for the admin edit form. */
  async payslipForEdit(payslipId: string) {
    const slip = await prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        lines: { orderBy: { displayOrder: "asc" }, include: { component: { select: { code: true, type: true } } } },
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      },
    });
    if (!slip) throw new NotFoundError("Payslip");
    return slip;
  },

  /**
   * Controlled payroll edit (PAYROLL_MANAGE). Replaces line items if provided and
   * recomputes gross/deductions/net; updates attendance, payment and notes fields.
   * Every edit is audited with before/after and stamps editedBy/editedAt.
   */
  async updatePayslip(req: Request, payslipId: string, input: PayslipEditInput) {
    const before = await prisma.payslip.findUnique({ where: { id: payslipId }, include: { lines: true } });
    if (!before) throw new NotFoundError("Payslip");

    const updated = await prisma.$transaction(async (tx) => {
      let totals: { gross: number; deductions: number; net: number } | null = null;
      if (input.lines) {
        await tx.payslipLine.deleteMany({ where: { payslipId } });
        if (input.lines.length) {
          await tx.payslipLine.createMany({
            data: input.lines.map((l, i) => ({
              payslipId,
              componentId: l.componentId,
              type: l.type,
              label: l.label,
              amount: l.amount,
              displayOrder: l.displayOrder ?? i + 1,
            })),
          });
        }
        const gross = round2(input.lines.filter((l) => l.type === "EARNING").reduce((s, l) => s + l.amount, 0));
        const deductions = round2(input.lines.filter((l) => l.type === "DEDUCTION").reduce((s, l) => s + l.amount, 0));
        totals = { gross, deductions, net: round2(gross - deductions) };
      }

      return tx.payslip.update({
        where: { id: payslipId },
        data: {
          ...(input.workingDays !== undefined ? { workingDays: input.workingDays } : {}),
          ...(input.paidDays !== undefined ? { paidDays: input.paidDays } : {}),
          ...(input.lopDays !== undefined ? { lopDays: input.lopDays } : {}),
          ...(input.holidays !== undefined ? { holidays: input.holidays } : {}),
          ...(input.weekOffs !== undefined ? { weekOffs: input.weekOffs } : {}),
          ...(input.overtimeHours !== undefined ? { overtimeHours: input.overtimeHours } : {}),
          ...(input.transactionId !== undefined ? { transactionId: input.transactionId } : {}),
          ...(input.paymentRef !== undefined ? { paymentRef: input.paymentRef } : {}),
          ...(input.paymentDate !== undefined ? { paymentDate: input.paymentDate } : {}),
          ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
          ...(input.paymentStatus !== undefined ? { paymentStatus: input.paymentStatus } : {}),
          ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
          ...(input.payrollNotes !== undefined ? { payrollNotes: input.payrollNotes } : {}),
          ...(input.hrNotes !== undefined ? { hrNotes: input.hrNotes } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(totals ? { grossEarnings: totals.gross, totalDeductions: totals.deductions, netPay: totals.net } : {
            ...(input.grossEarnings !== undefined ? { grossEarnings: input.grossEarnings } : {}),
            ...(input.totalDeductions !== undefined ? { totalDeductions: input.totalDeductions } : {}),
            ...(input.netPay !== undefined ? { netPay: input.netPay } : {}),
          }),
          editedBy: req.user!.id,
          editedAt: new Date(),
        },
      });
    });

    audit({ action: "payroll.payslip_edit", entity: "Payslip", entityId: payslipId, before, after: updated, req });
    return updated;
  },

  /** Manually add a single historical payslip (previous-month record, source = IMPORTED). */
  async createManualPayslip(req: Request, input: ManualPayslipInput) {
    const emp = await prisma.employee.findFirst({ where: { id: input.employeeId, deletedAt: null }, select: { id: true } });
    if (!emp) throw new NotFoundError("Employee");
    const dup = await prisma.payslip.findUnique({ where: { employeeId_month_year: { employeeId: input.employeeId, month: input.month, year: input.year } } });
    if (dup) throw new BadRequestError(`A payslip for ${MONTHS[input.month - 1]} ${input.year} already exists for this employee`);

    const gross = input.grossEarnings ?? 0;
    const deductions = input.totalDeductions ?? round2(Math.max(0, gross - (input.netPay ?? gross)));
    const net = input.netPay ?? round2(gross - deductions);

    const slip = await prisma.payslip.create({
      data: {
        employeeId: input.employeeId,
        month: input.month,
        year: input.year,
        workingDays: input.workingDays ?? 0,
        paidDays: input.paidDays ?? 0,
        lopDays: input.lopDays ?? 0,
        holidays: input.holidays ?? 0,
        weekOffs: input.weekOffs ?? 0,
        overtimeHours: input.overtimeHours ?? 0,
        grossEarnings: gross,
        totalDeductions: deductions,
        netPay: net,
        status: "PUBLISHED",
        source: "IMPORTED",
        publishedAt: new Date(),
        transactionId: input.transactionId ?? null,
        paymentRef: input.paymentRef ?? null,
        paymentDate: input.paymentDate ?? null,
        bankName: input.bankName ?? null,
        paymentStatus: input.paymentStatus ?? "PENDING",
        remarks: input.remarks ?? null,
      },
    });
    audit({ action: "payroll.payslip_manual_create", entity: "Payslip", entityId: slip.id, after: { month: input.month, year: input.year, net }, req });
    return slip;
  },

  /** Rich payslip detail for the modern viewer: employee, lines, attendance, bank, YTD, payment. */
  async payslipDetail(req: Request, payslipId: string) {
    const slip = await prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        lines: { orderBy: { displayOrder: "asc" }, include: { component: { select: { code: true } } } },
        run: { select: { status: true, paidAt: true, approvedAt: true } },
        employee: {
          include: {
            department: { select: { name: true } },
            designation: { select: { title: true } },
            location: { select: { name: true } },
            bankDetails: { where: { isPrimary: true }, take: 1 },
            company: { select: { name: true, bankName: true, bankAccountNo: true, bankIfsc: true, bankBranch: true } },
            salaries: { where: { isCurrent: true }, take: 1, select: { annualCtc: true, monthlyGross: true } },
          },
        },
      },
    });
    if (!slip) throw new NotFoundError("Payslip");
    const own = slip.employeeId === req.user?.employeeId;
    const privileged = req.user?.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "FINANCE_MANAGER"].includes(r));
    if (!own && !privileged) throw new ForbiddenError("You can only view your own payslips");
    if (own && slip.status !== "PUBLISHED") throw new NotFoundError("Payslip");

    // attendance breakdown for the payslip month
    const att = await attendanceService.monthFor(slip.employeeId, slip.month, slip.year).catch(() => null);
    const a = att?.summary;
    const presentDays = a ? a.present + a.halfDay * 0.5 : Number(slip.paidDays);
    const attendance = {
      workingDays: a?.workingDays ?? null,
      present: a ? a.present : null,
      paidDays: Number(slip.paidDays),
      leaveDays: a?.onLeave ?? null,
      lopDays: Number(slip.lopDays),
      attendancePct: a && a.workingDays ? Math.round((presentDays / a.workingDays) * 100) : null,
    };

    // YTD across the Indian financial year (Apr–Mar) up to this slip's period
    const fyStartYear = slip.month >= 4 ? slip.year : slip.year - 1;
    const fySlips = await prisma.payslip.findMany({
      where: {
        employeeId: slip.employeeId, status: "PUBLISHED",
        OR: [{ year: fyStartYear, month: { gte: 4 } }, { year: fyStartYear + 1, month: { lte: 3 } }],
      },
      include: { lines: { select: { type: true, amount: true, component: { select: { code: true } } } } },
    });
    const upto = fySlips.filter((s) => s.year * 12 + s.month <= slip.year * 12 + slip.month);
    const sumCode = (code: string) => upto.reduce((t, s) => t + s.lines.filter((l) => l.component.code === code).reduce((x, l) => x + Number(l.amount), 0), 0);
    const ytd = {
      gross: upto.reduce((t, s) => t + Number(s.grossEarnings), 0),
      net: upto.reduce((t, s) => t + Number(s.netPay), 0),
      tds: sumCode("TDS"),
      pf: sumCode("PF"),
    };

    const bank = slip.employee.bankDetails[0];
    return {
      id: slip.id,
      payslipNo: slip.payslipNo,
      generatedOn: slip.publishedAt ?? slip.createdAt,
      period: { month: slip.month, year: slip.year, label: `${MONTHS[slip.month - 1]} ${slip.year}` },
      status: slip.status,
      source: slip.source,
      payment: { status: slip.run?.status ?? "IMPORTED", paidAt: slip.run?.paidAt ?? null, processedAt: slip.run?.approvedAt ?? null, utr: null as string | null },
      company: {
        name: slip.employee.company.name,
        bankName: slip.employee.company.bankName,
        bankAccountNo: slip.employee.company.bankAccountNo,
        bankIfsc: slip.employee.company.bankIfsc,
        bankBranch: slip.employee.company.bankBranch,
      },
      employee: {
        id: slip.employee.id,
        name: `${slip.employee.firstName} ${slip.employee.lastName}`,
        code: slip.employee.employeeCode,
        photoUrl: slip.employee.photoUrl,
        designation: slip.employee.designation?.title ?? null,
        department: slip.employee.department?.name ?? null,
        location: slip.employee.location?.name ?? null,
        dateOfJoining: slip.employee.dateOfJoining,
        employmentType: slip.employee.employmentType,
      },
      earnings: slip.lines.filter((l) => l.type === "EARNING").map((l) => ({ label: l.label, code: l.component.code, amount: Number(l.amount) })),
      deductions: slip.lines.filter((l) => l.type === "DEDUCTION").map((l) => ({ label: l.label, code: l.component.code, amount: Number(l.amount) })),
      totals: { gross: Number(slip.grossEarnings), deductions: Number(slip.totalDeductions), net: Number(slip.netPay) },
      ctc: slip.employee.salaries[0] ? { annual: Number(slip.employee.salaries[0].annualCtc), monthly: Number(slip.employee.salaries[0].monthlyGross) } : null,
      bank: bank ? { bankName: bank.bankName, accountLast4: (decryptSafe(bank.accountNumber) ?? "").slice(-4), ifsc: bank.ifsc ?? null } : null,
      attendance,
      ytd,
    };
  },

  /** Email the payslip PDF to the employee. */
  async emailPayslip(req: Request, payslipId: string): Promise<void> {
    const slip = await prisma.payslip.findUnique({ where: { id: payslipId }, include: { employee: { select: { email: true, firstName: true, lastName: true } } } });
    if (!slip) throw new NotFoundError("Payslip");
    if (slip.employeeId !== req.user?.employeeId && !req.user?.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "FINANCE_MANAGER"].includes(r))) {
      throw new ForbiddenError("Not your payslip");
    }
    const pdf = await this.payslipPdf(req, payslipId, true);
    await mailService.sendPayslip(slip.employee.email, `${slip.employee.firstName} ${slip.employee.lastName}`, `${MONTHS[slip.month - 1]} ${slip.year}`, pdf);
    audit({ action: "payroll.payslip_email", entity: "Payslip", entityId: payslipId, req });
  },

  /** PDF for a payslip — self-service or payroll:read_all (route enforces). */
  async payslipPdf(req: Request, payslipId: string, systemCall = false): Promise<Buffer> {
    const slip = await prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        lines: { orderBy: { displayOrder: "asc" } },
        run: { select: { paidAt: true, approvedAt: true } },
        employee: {
          include: {
            department: { select: { name: true } },
            designation: { select: { title: true } },
            bankDetails: { where: { isPrimary: true }, take: 1 },
            company: { select: { name: true, address: true, email: true, phone: true, website: true } },
          },
        },
      },
    });
    if (!slip) throw new NotFoundError("Payslip");

    if (!systemCall) {
      const own = slip.employeeId === req.user?.employeeId;
      const privileged = req.user?.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "FINANCE_MANAGER"].includes(r));
      if (!own && !privileged) throw new ForbiddenError("You can only download your own payslips");
      if (own && slip.status !== "PUBLISHED") throw new NotFoundError("Payslip");
    }

    // Imported payslips are served as their original uploaded PDF (not re-rendered).
    if (slip.source === "IMPORTED") {
      const name = slip.pdfUrl?.split("/").pop();
      const bytes = name ? await getObject(name) : null;
      if (!bytes) throw new NotFoundError("Imported payslip PDF not found");
      return bytes;
    }

    // branding (logo / signatory / footer / watermark) — admin-managed, DB-driven
    const branding = await brandingService.get();
    const signatory = branding.signatory;

    const bank = slip.employee.bankDetails[0];
    const issueDate = slip.publishedAt ?? slip.run?.approvedAt ?? new Date();
    const payslipNo = slip.payslipNo ?? `ST/${slip.year}/P${String((parseInt(slip.id.slice(-5), 36) % 900) + 100)}`;

    return renderPayslipPdf({
      company: {
        name: slip.employee.company.name,
        address: slip.employee.company.address,
        email: branding.footer.email || slip.employee.company.email,
        phone: branding.footer.phone || slip.employee.company.phone,
        website: branding.footer.website || slip.employee.company.website,
        tagline: branding.tagline,
      },
      branding: {
        logoUrl: branding.logoUrl,
        signatureUrl: branding.signatures.hr,
        stampUrl: branding.stampUrl,
        watermark: branding.watermark,
      },
      employee: {
        name: `${slip.employee.firstName} ${slip.employee.lastName}`,
        code: slip.employee.employeeCode,
        designation: slip.employee.designation?.title ?? "—",
        department: slip.employee.department?.name ?? "—",
        email: slip.employee.email,
        bankLast4: bank ? (decryptSafe(bank.accountNumber) ?? "").slice(-4) : null,
        bankName: bank?.bankName ?? null,
        dateOfJoining: slip.employee.dateOfJoining ? formatDate(slip.employee.dateOfJoining) : null,
      },
      meta: { payslipNo, issueDate: formatDate(issueDate), currency: "INR" },
      payment: {
        mode: "Bank Transfer",
        refNo: null,
        paidOn: slip.run?.paidAt ? formatDate(slip.run.paidAt) : null,
      },
      signatory,
      period: `${MONTHS[slip.month - 1]} ${slip.year}`,
      paidDays: Number(slip.paidDays),
      lopDays: Number(slip.lopDays),
      earnings: slip.lines.filter((l) => l.type === "EARNING").map((l) => ({ label: l.label, amount: Number(l.amount) })),
      deductions: slip.lines.filter((l) => l.type === "DEDUCTION").map((l) => ({ label: l.label, amount: Number(l.amount) })),
      gross: Number(slip.grossEarnings),
      totalDeductions: Number(slip.totalDeductions),
      net: Number(slip.netPay),
    });
  },

  /** Salary register CSV for a run. */
  async registerCsv(runId: string): Promise<{ csv: string; filename: string }> {
    const run = await this.getRun(runId);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Code", "Name", "Department", "Paid Days", "LOP", "Gross", "Deductions", "Net"].map(esc).join(","),
      ...run.payslips.map((s) =>
        [
          s.employee.employeeCode, `${s.employee.firstName} ${s.employee.lastName}`, s.employee.department?.name,
          s.paidDays, s.lopDays, s.grossEarnings, s.totalDeductions, s.netPay,
        ].map(esc).join(",")
      ),
    ];
    return { csv: lines.join("\r\n"), filename: `salary-register-${run.year}-${String(run.month).padStart(2, "0")}.csv` };
  },
};
