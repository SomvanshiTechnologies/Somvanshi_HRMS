// Compliance & Statutory (Phase 9): statutory identifiers (masked PII),
// PF/PT/ESI/TDS registers (aggregated from payslips), filing calendar, retention.
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created, noContent } from "../../core/http.js";
import { BadRequestError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { encryptStatutoryInput, decryptStatutoryRecord, decryptSafe } from "../../core/fieldCrypto.js";

// ── PII masking ──────────────────────────────────────────────────────────────
function maskTail(value: string | null, visible = 4): string | null {
  if (!value) return null;
  const v = value.replace(/\s+/g, "");
  if (v.length <= visible) return "•".repeat(v.length);
  return "•".repeat(v.length - visible) + v.slice(-visible);
}

function maskStatutory(s: Record<string, unknown> | null) {
  if (!s) return null;
  return {
    ...s,
    aadhaarNumber: maskTail(s["aadhaarNumber"] as string | null, 4),
    panNumber: maskTail(s["panNumber"] as string | null, 2),
    uanNumber: maskTail(s["uanNumber"] as string | null, 4),
    pfNumber: maskTail(s["pfNumber"] as string | null, 4),
    esicNumber: maskTail(s["esicNumber"] as string | null, 4),
    nationalId: maskTail(s["nationalId"] as string | null, 4),
  };
}

const StatutorySchema = z.object({
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Aadhaar must be 12 digits").optional().or(z.literal("")),
  panNumber: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Invalid PAN format").optional().or(z.literal("")),
  uanNumber: z.string().regex(/^\d{12}$/, "UAN must be 12 digits").optional().or(z.literal("")),
  pfNumber: z.string().max(40).optional().or(z.literal("")),
  esicNumber: z.string().max(40).optional().or(z.literal("")),
  nationalId: z.string().max(40).optional().or(z.literal("")),
  taxRegime: z.enum(["OLD", "NEW"]).optional(),
  pfOptedIn: z.boolean().optional(),
  esiApplicable: z.boolean().optional(),
});

const TaskSchema = z.object({
  type: z.enum(["PF_ECR", "PT_RETURN", "ESI_RETURN", "TDS_PAYMENT", "TDS_RETURN", "GRATUITY", "LWF", "SHOPS_ACT", "OTHER"]),
  title: z.string().min(3).max(200),
  authority: z.string().max(80).optional(),
  period: z.string().min(2).max(40),
  dueDate: z.coerce.date(),
  amount: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});
const TaskUpdateSchema = z.object({
  status: z.enum(["PENDING", "FILED", "OVERDUE", "WAIVED"]).optional(),
  reference: z.string().max(120).optional(),
  amount: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});
const GenerateSchema = z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2100) });

function cleanInput(body: z.infer<typeof StatutorySchema>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === "" ) { out[k] = null; continue; }
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export const complianceRouter: Router = Router();
complianceRouter.use(requireAuth);
const canReadAll = requirePermission(PERMISSIONS.COMPLIANCE_READ_ALL, PERMISSIONS.COMPLIANCE_MANAGE);
const canManage = requirePermission(PERMISSIONS.COMPLIANCE_MANAGE);

function canSeeFull(req: Request): boolean {
  return req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "FINANCE_MANAGER"].includes(r));
}

// ── self-service: my statutory record ────────────────────────────────────────
complianceRouter.get("/me", requirePermission(PERMISSIONS.COMPLIANCE_READ), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) return void ok(res, null);
  const rec = await prisma.employeeStatutory.findUnique({ where: { employeeId: req.user.employeeId } });
  ok(res, decryptStatutoryRecord(rec)); // own data — decrypted, unmasked
}));

complianceRouter.put("/me", requirePermission(PERMISSIONS.COMPLIANCE_UPDATE), validate({ body: StatutorySchema }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
  const data = encryptStatutoryInput(cleanInput(req.body as z.infer<typeof StatutorySchema>));
  const rec = await prisma.employeeStatutory.upsert({
    where: { employeeId: req.user.employeeId },
    create: { employeeId: req.user.employeeId, ...data },
    update: { ...data, verifiedAt: null, verifiedBy: null }, // edits reset verification
  });
  audit({ action: "compliance.self_update", entity: "EmployeeStatutory", entityId: rec.id, req });
  ok(res, decryptStatutoryRecord(rec), "Statutory details saved.");
}));

// ── directory (HR/Finance) ───────────────────────────────────────────────────
complianceRouter.get(
  "/directory",
  canReadAll,
  validate({ query: z.object({ search: z.string().optional(), filter: z.enum(["all", "incomplete", "unverified"]).optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { search, filter } = req.query as Record<string, string | undefined>;
    const employees = await prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: { in: ["ACTIVE", "PROBATION", "ONBOARDING"] },
        ...(search ? { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }, { employeeCode: { contains: search } }] } : {}),
      },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true,
        department: { select: { name: true } }, designation: { select: { title: true } },
        statutory: true,
      },
      orderBy: { firstName: "asc" },
      take: 500,
    });
    const full = canSeeFull(req);
    const rows = employees.map((e) => {
      const s = decryptStatutoryRecord(e.statutory as Record<string, unknown> | null);
      const complete = Boolean(s?.["aadhaarNumber"] && s?.["panNumber"]);
      return {
        id: e.id, employeeCode: e.employeeCode, firstName: e.firstName, lastName: e.lastName, photoUrl: e.photoUrl,
        department: e.department?.name ?? null, designation: e.designation?.title ?? null,
        statutory: full ? s : maskStatutory(s),
        complete,
        verified: Boolean(s?.verifiedAt),
      };
    });
    const filtered = filter === "incomplete" ? rows.filter((r) => !r.complete)
      : filter === "unverified" ? rows.filter((r) => r.complete && !r.verified)
      : rows;
    ok(res, filtered);
  })
);

complianceRouter.put("/employee/:id", canManage, validate({ body: StatutorySchema.extend({ verify: z.boolean().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const employeeId = req.params["id"] as string;
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true } });
  if (!emp) throw new NotFoundError("Employee");
  const { verify, ...rest } = req.body as z.infer<typeof StatutorySchema> & { verify?: boolean };
  const data = encryptStatutoryInput(cleanInput(rest));
  const verifyData = verify ? { verifiedAt: new Date(), verifiedBy: req.user!.id } : {};
  const rec = await prisma.employeeStatutory.upsert({
    where: { employeeId },
    create: { employeeId, ...data, ...verifyData },
    update: { ...data, ...verifyData },
  });
  audit({ action: verify ? "compliance.verify" : "compliance.update", entity: "EmployeeStatutory", entityId: rec.id, req });
  ok(res, decryptStatutoryRecord(rec), verify ? "Verified." : "Updated.");
}));

// ── statutory registers (PF/PT/ESI/TDS) from payslip lines ───────────────────
complianceRouter.get(
  "/registers",
  canReadAll,
  validate({ query: z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int().min(2020).max(2100) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const month = Number(req.query["month"]);
    const year = Number(req.query["year"]);
    const slips = await prisma.payslip.findMany({
      where: { month, year },
      select: {
        employeeId: true, grossEarnings: true,
        employee: { select: { firstName: true, lastName: true, employeeCode: true, statutory: { select: { uanNumber: true, esicNumber: true, panNumber: true } } } },
        lines: { select: { amount: true, component: { select: { code: true } } } },
      },
    });
    const STAT = new Set(["PF", "PT", "ESI", "TDS"]);
    const rows = slips.map((s) => {
      const byCode: Record<string, number> = { PF: 0, PT: 0, ESI: 0, TDS: 0 };
      for (const l of s.lines) {
        const code = l.component.code;
        if (STAT.has(code)) byCode[code] = (byCode[code] ?? 0) + Number(l.amount);
      }
      return {
        employeeId: s.employeeId,
        employeeCode: s.employee.employeeCode,
        name: `${s.employee.firstName} ${s.employee.lastName}`,
        uan: maskTail(decryptSafe(s.employee.statutory?.uanNumber), 4),
        esic: maskTail(decryptSafe(s.employee.statutory?.esicNumber), 4),
        pan: maskTail(decryptSafe(s.employee.statutory?.panNumber), 2),
        gross: Number(s.grossEarnings),
        pf: byCode["PF"] ?? 0, pt: byCode["PT"] ?? 0, esi: byCode["ESI"] ?? 0, tds: byCode["TDS"] ?? 0,
      };
    });
    const totals = rows.reduce(
      (a, r) => ({ pf: a.pf + r.pf, pt: a.pt + r.pt, esi: a.esi + r.esi, tds: a.tds + r.tds, gross: a.gross + r.gross }),
      { pf: 0, pt: 0, esi: 0, tds: 0, gross: 0 }
    );
    ok(res, { month, year, employees: rows.length, rows, totals });
  })
);

// ── filing calendar ──────────────────────────────────────────────────────────
complianceRouter.get("/tasks", canReadAll, validate({ query: z.object({ status: z.string().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string | undefined>;
  // lazily flag overdue
  await prisma.complianceTask.updateMany({ where: { status: "PENDING", dueDate: { lt: new Date() } }, data: { status: "OVERDUE" } });
  const tasks = await prisma.complianceTask.findMany({
    where: { ...(status ? { status: status as never } : {}) },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 200,
  });
  ok(res, tasks);
}));

complianceRouter.post("/tasks", canManage, validate({ body: TaskSchema }), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof TaskSchema>;
  const exists = await prisma.complianceTask.findFirst({ where: { type: body.type, period: body.period } });
  if (exists) throw new BadRequestError(`A ${body.type} task already exists for ${body.period}`);
  const task = await prisma.complianceTask.create({ data: { ...body, amount: body.amount ?? null } });
  audit({ action: "compliance.task_create", entity: "ComplianceTask", entityId: task.id, req });
  created(res, task, "Filing task added.");
}));

complianceRouter.patch("/tasks/:id", canManage, validate({ body: TaskUpdateSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const body = req.body as z.infer<typeof TaskUpdateSchema>;
  const task = await prisma.complianceTask.findUnique({ where: { id } });
  if (!task) throw new NotFoundError("Compliance task");
  const filing = body.status === "FILED" ? { filedAt: new Date(), filedBy: req.user!.id } : {};
  const updated = await prisma.complianceTask.update({
    where: { id },
    data: { ...body, ...(body.amount !== undefined ? { amount: body.amount } : {}), ...filing },
  });
  audit({ action: "compliance.task_update", entity: "ComplianceTask", entityId: id, after: { status: body.status }, req });
  ok(res, updated, body.status === "FILED" ? "Marked filed." : "Task updated.");
}));

complianceRouter.delete("/tasks/:id", canManage, asyncHandler(async (req: Request, res: Response) => {
  await prisma.complianceTask.delete({ where: { id: req.params["id"] as string } });
  noContent(res);
}));

/** Auto-generate the standard Indian monthly statutory filings for a payroll month. */
complianceRouter.post("/tasks/generate", canManage, validate({ body: GenerateSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { month, year } = req.body as z.infer<typeof GenerateSchema>;
  const periodLabel = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
  // due dates fall in the FOLLOWING month (JS month index `month` == next calendar month)
  const due = (day: number) => new Date(year, month, day);
  const defs: Array<{ type: z.infer<typeof TaskSchema>["type"]; title: string; authority: string; day: number }> = [
    { type: "TDS_PAYMENT", title: "TDS payment (salary)", authority: "Income Tax", day: 7 },
    { type: "PF_ECR", title: "PF ECR filing & payment", authority: "EPFO", day: 15 },
    { type: "ESI_RETURN", title: "ESI contribution", authority: "ESIC", day: 15 },
    { type: "PT_RETURN", title: "Professional Tax return", authority: "State PT", day: 20 },
  ];
  let createdCount = 0;
  for (const d of defs) {
    const exists = await prisma.complianceTask.findFirst({ where: { type: d.type, period: periodLabel } });
    if (exists) continue;
    await prisma.complianceTask.create({ data: { type: d.type, title: `${d.title} — ${periodLabel}`, authority: d.authority, period: periodLabel, dueDate: due(d.day) } });
    createdCount++;
  }
  audit({ action: "compliance.tasks_generate", entity: "ComplianceTask", after: { period: periodLabel, createdCount }, req });
  ok(res, { period: periodLabel, created: createdCount }, `Generated ${createdCount} filing task${createdCount === 1 ? "" : "s"} for ${periodLabel}.`);
}));

// ── document expiry tracking (retention) ─────────────────────────────────────
complianceRouter.get("/document-expiry", canReadAll, validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const days = Number(req.query["days"] ?? 90);
  const horizon = new Date(Date.now() + days * 86400000);
  const docs = await prisma.employeeDocument.findMany({
    where: { isCurrent: true, expiresOn: { not: null, lte: horizon } },
    select: { id: true, name: true, category: true, expiresOn: true, employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
    orderBy: { expiresOn: "asc" },
    take: 200,
  });
  ok(res, docs.map((d) => ({ ...d, expired: d.expiresOn! < new Date() })));
}));

// ── dashboard summary ────────────────────────────────────────────────────────
complianceRouter.get("/summary", canReadAll, asyncHandler(async (_req: Request, res: Response) => {
  await prisma.complianceTask.updateMany({ where: { status: "PENDING", dueDate: { lt: new Date() } }, data: { status: "OVERDUE" } });
  const soon = new Date(Date.now() + 15 * 86400000);
  const [activeEmployees, withStatutory, verified, overdue, dueSoon, docsExpiring] = await Promise.all([
    prisma.employee.count({ where: { deletedAt: null, status: { in: ["ACTIVE", "PROBATION", "ONBOARDING"] } } }),
    prisma.employeeStatutory.count({ where: { aadhaarNumber: { not: null }, panNumber: { not: null } } }),
    prisma.employeeStatutory.count({ where: { verifiedAt: { not: null } } }),
    prisma.complianceTask.count({ where: { status: "OVERDUE" } }),
    prisma.complianceTask.count({ where: { status: "PENDING", dueDate: { lte: soon } } }),
    prisma.employeeDocument.count({ where: { isCurrent: true, expiresOn: { not: null, lte: new Date(Date.now() + 90 * 86400000) } } }),
  ]);
  ok(res, {
    activeEmployees,
    statutoryComplete: withStatutory,
    statutoryPending: Math.max(0, activeEmployees - withStatutory),
    verified,
    completionPct: activeEmployees ? Math.round((withStatutory / activeEmployees) * 100) : 0,
    overdueFilings: overdue,
    filingsDueSoon: dueSoon,
    documentsExpiring: docsExpiring,
  });
}));
