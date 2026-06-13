import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { notify } from "../notifications/notifications.service.js";
import { mailService } from "../notifications/mail.service.js";
import { attendanceService } from "../attendance/attendance.service.js";
import { breakupFromCtc, esiEmployee, monthlyTds, pfEmployee, professionalTax, round2 } from "./payroll.calc.js";
import { renderPayslipPdf } from "./payslip.pdf.js";
import { formatDate } from "../../shared/format.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function componentId(code: string): Promise<string> {
  const comp = await prisma.salaryComponent.findUnique({ where: { code } });
  if (!comp) throw new BadRequestError(`Salary component ${code} missing — run the seed`);
  return comp.id;
}

export const payrollService = {
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

    const breakup = breakupFromCtc(input.annualCtc);
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

    // reprocess = wipe previous draft output
    await prisma.payslip.deleteMany({ where: { runId: run.id } });

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

    for (const employee of employees) {
      const salary = employee.salaries[0];
      if (!salary) {
        skipped.push(`${employee.firstName} ${employee.lastName} (no salary assigned)`);
        continue;
      }

      // LOP days = absences + unpaid (LOP-type) approved leave, from real records
      const { summary } = await attendanceService.monthFor(employee.id, month, year);
      const lopLeave = await prisma.leaveRequest.findMany({
        where: {
          employeeId: employee.id, status: "APPROVED", leaveType: { code: "LOP" },
          startDate: { lte: new Date(year, month, 0) }, endDate: { gte: new Date(year, month - 1, 1) },
        },
        select: { days: true },
      });
      const lopDays = Math.min(daysInMonth, summary.absent + lopLeave.reduce((s, l) => s + l.days, 0));
      const paidDays = round2(daysInMonth - lopDays);
      const prorate = paidDays / daysInMonth;

      const comp = (cid: string) => Number(salary.components.find((c) => c.componentId === cid)?.monthlyAmount ?? 0);
      const basic = round2(comp(ids.BASIC) * prorate);
      const hra = round2(comp(ids.HRA) * prorate);
      const sa = round2(comp(ids.SA) * prorate);
      const gross = round2(basic + hra + sa);

      const pf = pfEmployee(basic);
      const pt = professionalTax(gross);
      const esi = esiEmployee(gross);
      const tds = monthlyTds(Number(salary.annualCtc));
      const deductions = round2(pf + pt + esi + tds);
      const net = round2(gross - deductions);

      await prisma.payslip.create({
        data: {
          runId: run.id, employeeId: employee.id, month, year,
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
        remarks: skipped.length ? `Skipped: ${skipped.join("; ")}` : null,
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
            company: { select: { name: true } },
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
      period: { month: slip.month, year: slip.year, label: `${MONTHS[slip.month - 1]} ${slip.year}` },
      status: slip.status,
      payment: { status: slip.run.status, paidAt: slip.run.paidAt, processedAt: slip.run.approvedAt, utr: null as string | null },
      company: { name: slip.employee.company.name },
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
      bank: bank ? { bankName: bank.bankName, accountLast4: bank.accountNumber.slice(-4), ifsc: bank.ifsc ?? null } : null,
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
        employee: {
          include: {
            department: { select: { name: true } },
            designation: { select: { title: true } },
            bankDetails: { where: { isPrimary: true }, take: 1 },
            company: { select: { name: true, address: true } },
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

    return renderPayslipPdf({
      company: { name: slip.employee.company.name, address: slip.employee.company.address },
      employee: {
        name: `${slip.employee.firstName} ${slip.employee.lastName}`,
        code: slip.employee.employeeCode,
        designation: slip.employee.designation?.title ?? "—",
        department: slip.employee.department?.name ?? "—",
        email: slip.employee.email,
        bankLast4: slip.employee.bankDetails[0]?.accountNumber.slice(-4) ?? null,
        dateOfJoining: slip.employee.dateOfJoining ? formatDate(slip.employee.dateOfJoining) : null,
      },
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
