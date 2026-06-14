import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created } from "../../core/http.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { notify, notifyMany } from "../notifications/notifications.service.js";
import { buildExitDocument, EXIT_DOC_TYPES, type ExitDocType } from "./exit.documents.js";
import type { Prisma } from "../../generated/prisma/client.js";

/** Default off-boarding clearance checklist generated when a resignation is accepted. */
const CLEARANCE_TEMPLATE: Array<{ department: string; item: string }> = [
  { department: "IT", item: "Return laptop, charger & access card" },
  { department: "IT", item: "Revoke email, VPN & system access" },
  { department: "HR", item: "Exit interview completed" },
  { department: "HR", item: "Return ID card & company assets" },
  { department: "MANAGER", item: "Project handover & knowledge transfer sign-off" },
  { department: "FINANCE", item: "Clear advances, loans & pending dues" },
  { department: "FINANCE", item: "Full & final settlement processed" },
];

const SubmitSchema = z.object({
  reason: z.string().min(10).max(2000),
  noticePeriodDays: z.number().int().min(0).max(180).default(60),
  lastWorkingDay: z.coerce.date(),
});
const AcceptSchema = z.object({ lastWorkingDay: z.coerce.date().optional(), remarks: z.string().max(500).optional() });
const ClearanceSchema = z.object({ status: z.enum(["CLEARED", "BLOCKED", "PENDING"]), remarks: z.string().max(500).optional() });
const AddClearanceSchema = z.object({ department: z.string().min(2).max(40), item: z.string().min(3).max(200) });
const InterviewSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  conductedAt: z.coerce.date().optional(),
  responses: z.record(z.string(), z.unknown()).optional(),
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]).optional(),
  summary: z.string().max(4000).optional(),
});
const FnfCalcSchema = z.object({
  pendingSalaryDays: z.number().min(0).max(31).default(0),
  noticeRecoveryDays: z.number().min(0).max(180).default(0),
  otherEarnings: z.number().min(0).default(0),
  otherDeductions: z.number().min(0).default(0),
});
const FnfDecideSchema = z.object({
  action: z.enum(["APPROVE", "SETTLE"]),
  relievingLetterUrl: z.string().max(500).optional(),
  experienceLetterUrl: z.string().max(500).optional(),
});

const RESIGNATION_INCLUDE = {
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, userId: true, department: { select: { name: true } }, designation: { select: { title: true } } } },
  clearanceItems: { orderBy: { createdAt: "asc" as const } },
  exitInterview: true,
  fnf: true,
};

export const exitRouter: Router = Router();
exitRouter.use(requireAuth);
const canApprove = requirePermission(PERMISSIONS.EXIT_APPROVE, PERMISSIONS.EXIT_MANAGE);
const canManage = requirePermission(PERMISSIONS.EXIT_MANAGE);

const REVIEWER_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE", "FINANCE_MANAGER", "DEPARTMENT_HEAD", "MANAGER"];
function isReviewer(req: Request): boolean {
  return req.user!.roles.some((r) => REVIEWER_ROLES.includes(r));
}

// ---- summary ----
exitRouter.get("/summary", canApprove, asyncHandler(async (_req: Request, res: Response) => {
  const [byStatus, active, pendingFnf] = await Promise.all([
    prisma.resignation.groupBy({ by: ["status"], _count: true }),
    prisma.resignation.count({ where: { status: { in: ["SUBMITTED", "ACCEPTED", "IN_NOTICE"] } } }),
    prisma.fnfSettlement.count({ where: { status: { in: ["PENDING", "CALCULATED"] } } }),
  ]);
  ok(res, {
    active,
    pendingFnf,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
  });
}));

// ---- list ----
exitRouter.get(
  "/",
  validate({ query: z.object({ status: z.string().optional(), scope: z.enum(["mine", "all"]).optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, scope } = req.query as Record<string, string | undefined>;
    const reviewerView = isReviewer(req) && scope !== "mine";
    const where: Prisma.ResignationWhereInput = {
      ...(reviewerView ? {} : { employeeId: req.user!.employeeId ?? "none" }),
      ...(status ? { status: status as never } : {}),
    };
    const resignations = await prisma.resignation.findMany({ where, orderBy: { submittedAt: "desc" }, include: RESIGNATION_INCLUDE, take: 200 });
    ok(res, { resignations, reviewerView });
  })
);

exitRouter.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const r = await prisma.resignation.findUnique({ where: { id: req.params["id"] as string }, include: RESIGNATION_INCLUDE });
  if (!r) throw new NotFoundError("Resignation");
  if (!isReviewer(req) && r.employeeId !== req.user!.employeeId) throw new ForbiddenError("Not your resignation");
  ok(res, r);
}));

// ---- submit resignation (employee) ----
exitRouter.post("/", requirePermission(PERMISSIONS.EXIT_CREATE), validate({ body: SubmitSchema }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
  const open = await prisma.resignation.findFirst({ where: { employeeId: req.user.employeeId, status: { in: ["SUBMITTED", "ACCEPTED", "IN_NOTICE"] } } });
  if (open) throw new BadRequestError("You already have an active resignation in progress");
  const body = req.body as z.infer<typeof SubmitSchema>;
  const resignation = await prisma.resignation.create({
    data: { employeeId: req.user.employeeId, reason: body.reason, noticePeriodDays: body.noticePeriodDays, lastWorkingDay: body.lastWorkingDay },
    include: RESIGNATION_INCLUDE,
  });
  const hr = await prisma.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["HR_ADMIN", "HR_EXECUTIVE", "SUPER_ADMIN"] } } } } }, select: { id: true } });
  await notifyMany(hr.map((u) => u.id), { type: "APPROVAL", title: `Resignation: ${resignation.employee.firstName} ${resignation.employee.lastName}`, body: `LWD ${body.lastWorkingDay.toDateString()}`, link: "/exit" });
  audit({ action: "exit.submit", entity: "Resignation", entityId: resignation.id, req });
  created(res, resignation, "Resignation submitted.");
}));

// ---- retract (employee, before acceptance) ----
exitRouter.post("/:id/retract", asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const r = await prisma.resignation.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("Resignation");
  if (r.employeeId !== req.user!.employeeId) throw new ForbiddenError("Not your resignation");
  if (r.status !== "SUBMITTED") throw new BadRequestError("Only a submitted resignation can be retracted");
  const updated = await prisma.resignation.update({ where: { id }, data: { status: "RETRACTED", retractedAt: new Date() }, include: RESIGNATION_INCLUDE });
  audit({ action: "exit.retract", entity: "Resignation", entityId: id, req });
  ok(res, updated, "Resignation retracted.");
}));

// ---- accept (HR/manager) → generate clearance checklist + notice period ----
exitRouter.patch("/:id/accept", canApprove, validate({ body: AcceptSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const { lastWorkingDay, remarks } = req.body as z.infer<typeof AcceptSchema>;
  const r = await prisma.resignation.findUnique({ where: { id }, include: { employee: { select: { userId: true } }, clearanceItems: true } });
  if (!r) throw new NotFoundError("Resignation");
  if (r.status !== "SUBMITTED") throw new BadRequestError("Resignation is not awaiting acceptance");
  const updated = await prisma.$transaction(async (tx) => {
    const res2 = await tx.resignation.update({
      where: { id },
      data: { status: "IN_NOTICE", acceptedBy: req.user!.id, acceptedAt: new Date(), ...(lastWorkingDay ? { lastWorkingDay } : {}), ...(remarks ? { remarks } : {}) },
    });
    if (r.clearanceItems.length === 0) {
      await tx.clearanceItem.createMany({ data: CLEARANCE_TEMPLATE.map((c) => ({ resignationId: id, department: c.department, item: c.item })) });
    }
    return res2;
  });
  if (r.employee.userId) await notify({ userId: r.employee.userId, type: "INFO", title: "Resignation accepted", body: `Last working day: ${updated.lastWorkingDay.toDateString()}`, link: "/exit" });
  audit({ action: "exit.accept", entity: "Resignation", entityId: id, req });
  ok(res, await prisma.resignation.findUnique({ where: { id }, include: RESIGNATION_INCLUDE }), "Resignation accepted — clearance checklist generated.");
}));

// ---- clearance: add / update items ----
exitRouter.post("/:id/clearance", canManage, validate({ body: AddClearanceSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const r = await prisma.resignation.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("Resignation");
  const body = req.body as z.infer<typeof AddClearanceSchema>;
  await prisma.clearanceItem.create({ data: { resignationId: id, department: body.department.toUpperCase(), item: body.item } });
  audit({ action: "exit.clearance_add", entity: "Resignation", entityId: id, req });
  created(res, await prisma.resignation.findUnique({ where: { id }, include: RESIGNATION_INCLUDE }), "Clearance item added.");
}));

exitRouter.patch("/:id/clearance/:itemId", canApprove, validate({ body: ClearanceSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const itemId = req.params["itemId"] as string;
  const { status, remarks } = req.body as z.infer<typeof ClearanceSchema>;
  const item = await prisma.clearanceItem.findFirst({ where: { id: itemId, resignationId: id } });
  if (!item) throw new NotFoundError("Clearance item");
  await prisma.clearanceItem.update({
    where: { id: itemId },
    data: { status, remarks: remarks ?? null, clearedBy: status === "CLEARED" ? req.user!.id : null, clearedAt: status === "CLEARED" ? new Date() : null },
  });
  audit({ action: "exit.clearance_update", entity: "Resignation", entityId: id, after: { itemId, status }, req });
  ok(res, await prisma.resignation.findUnique({ where: { id }, include: RESIGNATION_INCLUDE }), `Marked ${status.toLowerCase()}.`);
}));

// ---- exit interview ----
exitRouter.post("/:id/interview", canApprove, validate({ body: InterviewSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const r = await prisma.resignation.findUnique({ where: { id } });
  if (!r) throw new NotFoundError("Resignation");
  const body = req.body as z.infer<typeof InterviewSchema>;
  const data = {
    conductedBy: req.user!.id,
    ...(body.scheduledAt ? { scheduledAt: body.scheduledAt } : {}),
    ...(body.conductedAt ? { conductedAt: body.conductedAt } : {}),
    ...(body.responses ? { responses: body.responses as Prisma.InputJsonValue } : {}),
    ...(body.sentiment ? { sentiment: body.sentiment } : {}),
    ...(body.summary ? { summary: body.summary } : {}),
  };
  await prisma.exitInterview.upsert({ where: { resignationId: id }, create: { resignationId: id, ...data }, update: data });
  audit({ action: "exit.interview", entity: "Resignation", entityId: id, req });
  ok(res, await prisma.resignation.findUnique({ where: { id }, include: RESIGNATION_INCLUDE }), "Exit interview saved.");
}));

// ---- F&F: calculate (auto leave encashment + manual adjustments) ----
exitRouter.post("/:id/fnf/calculate", canManage, validate({ body: FnfCalcSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const { pendingSalaryDays, noticeRecoveryDays, otherEarnings, otherDeductions } = req.body as z.infer<typeof FnfCalcSchema>;
  const r = await prisma.resignation.findUnique({ where: { id }, include: { employee: { select: { id: true } } } });
  if (!r) throw new NotFoundError("Resignation");

  const salary = await prisma.employeeSalary.findFirst({ where: { employeeId: r.employeeId, isCurrent: true }, orderBy: { effectiveFrom: "desc" } });
  const monthlyGross = salary ? Number(salary.monthlyGross) : 0;
  const perDay = monthlyGross / 30;

  const year = new Date().getFullYear();
  const balances = await prisma.leaveBalance.findMany({ where: { employeeId: r.employeeId, year } });
  const leaveDays = balances.reduce((acc, b) => acc + Math.max(0, b.entitled + b.accrued + b.carriedOver - b.used - b.pending), 0);

  const round = (n: number) => Math.round(n * 100) / 100;
  const pendingSalary = round(perDay * pendingSalaryDays);
  const leaveEncashment = round(perDay * leaveDays);
  const noticeRecovery = round(perDay * noticeRecoveryDays);

  const earnings = round(pendingSalary + leaveEncashment + otherEarnings);
  const deductions = round(noticeRecovery + otherDeductions);
  const netPayable = round(earnings - deductions);

  const breakdown = {
    monthlyGross: round(monthlyGross),
    earnings: [
      { label: `Pending salary (${pendingSalaryDays} days)`, amount: pendingSalary },
      { label: `Leave encashment (${leaveDays.toFixed(1)} days)`, amount: leaveEncashment },
      { label: "Other earnings", amount: otherEarnings },
    ],
    deductions: [
      { label: `Notice shortfall recovery (${noticeRecoveryDays} days)`, amount: noticeRecovery },
      { label: "Other deductions", amount: otherDeductions },
    ],
  };

  await prisma.fnfSettlement.upsert({
    where: { resignationId: id },
    create: { resignationId: id, earnings, deductions, netPayable, breakdown: breakdown as Prisma.InputJsonValue, status: "CALCULATED" },
    update: { earnings, deductions, netPayable, breakdown: breakdown as Prisma.InputJsonValue, status: "CALCULATED" },
  });
  audit({ action: "exit.fnf_calculate", entity: "Resignation", entityId: id, req });
  ok(res, await prisma.resignation.findUnique({ where: { id }, include: RESIGNATION_INCLUDE }), "Full & final settlement calculated.");
}));

// ---- F&F: approve / settle ----
exitRouter.patch("/:id/fnf", canApprove, validate({ body: FnfDecideSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const { action, relievingLetterUrl, experienceLetterUrl } = req.body as z.infer<typeof FnfDecideSchema>;
  const r = await prisma.resignation.findUnique({ where: { id }, include: { fnf: true, employee: { select: { id: true, userId: true } } } });
  if (!r) throw new NotFoundError("Resignation");
  if (!r.fnf) throw new BadRequestError("Calculate the settlement first");

  if (action === "APPROVE") {
    if (r.fnf.status !== "CALCULATED") throw new BadRequestError("Settlement is not awaiting approval");
    await prisma.fnfSettlement.update({ where: { resignationId: id }, data: { status: "APPROVED", approvedBy: req.user!.id } });
    audit({ action: "exit.fnf_approve", entity: "Resignation", entityId: id, req });
    return void ok(res, await prisma.resignation.findUnique({ where: { id }, include: RESIGNATION_INCLUDE }), "Settlement approved.");
  }

  // SETTLE → close out the exit, mark employee EXITED
  if (r.fnf.status !== "APPROVED") throw new BadRequestError("Settlement must be approved before settling");
  await prisma.$transaction([
    prisma.fnfSettlement.update({ where: { resignationId: id }, data: { status: "SETTLED", settledAt: new Date(), relievingLetterUrl: relievingLetterUrl ?? null, experienceLetterUrl: experienceLetterUrl ?? null } }),
    prisma.resignation.update({ where: { id }, data: { status: "EXITED" } }),
    prisma.employee.update({ where: { id: r.employeeId }, data: { status: "ALUMNI", exitedAt: new Date() } }),
  ]);
  // deactivate login
  const emp = await prisma.employee.findUnique({ where: { id: r.employeeId }, select: { userId: true } });
  if (emp?.userId) await prisma.user.update({ where: { id: emp.userId }, data: { status: "DEACTIVATED" } });
  if (r.employee.userId) await notify({ userId: r.employee.userId, type: "SUCCESS", title: "Full & final settled", body: `Net payable ₹${r.fnf.netPayable}. Wishing you the best!`, link: "/exit" });
  audit({ action: "exit.fnf_settle", entity: "Resignation", entityId: id, req });
  ok(res, await prisma.resignation.findUnique({ where: { id }, include: RESIGNATION_INCLUDE }), "Settlement completed — employee off-boarded.");
}));

// ---- branded exit documents (relieving / experience / service / no-dues / F&F / acknowledgement) ----
exitRouter.get("/:id/documents/:type", asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const type = req.params["type"] as ExitDocType;
  if (!EXIT_DOC_TYPES.includes(type)) throw new BadRequestError(`Unknown document type. One of: ${EXIT_DOC_TYPES.join(", ")}`);
  const r = await prisma.resignation.findUnique({ where: { id }, select: { employeeId: true, status: true } });
  if (!r) throw new NotFoundError("Resignation");
  const own = r.employeeId === req.user!.employeeId;
  if (!isReviewer(req) && !own) throw new ForbiddenError("Not your resignation");
  if (!["IN_NOTICE", "EXITED"].includes(r.status)) throw new BadRequestError("Exit documents are available once the resignation is accepted");

  const { buffer, filename } = await buildExitDocument(id, type);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  audit({ action: "exit.document_generate", entity: "Resignation", entityId: id, after: { type }, req });
  res.send(buffer);
}));
