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
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { notify, notifyMany } from "../notifications/notifications.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

const ItemSchema = z.object({
  categoryId: z.string().min(1),
  date: z.coerce.date(),
  amount: z.number().positive().max(10_000_000),
  description: z.string().max(500).optional(),
  receiptUrl: z.string().max(500).optional(),
});
const CreateReportSchema = z.object({
  title: z.string().min(3).max(120),
  items: z.array(ItemSchema).min(1).max(50),
});
const UpdateReportSchema = z.object({ title: z.string().min(3).max(120) });
const DecideSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), remarks: z.string().max(500).optional() });
const ReimburseSchema = z.object({ paidVia: z.enum(["PAYROLL", "BANK_TRANSFER"]).default("BANK_TRANSFER"), reference: z.string().max(120).optional() });
const CategorySchema = z.object({
  name: z.string().min(2).max(60),
  maxAmount: z.number().positive().optional(),
  requiresReceipt: z.boolean().default(true),
});

const REPORT_INCLUDE = {
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true } },
  items: { include: { category: { select: { id: true, name: true } } }, orderBy: { date: "asc" as const } },
  reimbursement: true,
};

export const expenseRouter: Router = Router();
expenseRouter.use(requireAuth);
const canApprove = requirePermission(PERMISSIONS.EXPENSE_APPROVE, PERMISSIONS.EXPENSE_MANAGE);
const canManage = requirePermission(PERMISSIONS.EXPENSE_MANAGE);

/** Finance/approvers see every report; employees see only their own. */
const REVIEWER_ROLES = ["SUPER_ADMIN", "FINANCE_MANAGER", "DEPARTMENT_HEAD", "MANAGER"];
function isReviewer(req: Request): boolean {
  return req.user!.roles.some((r) => REVIEWER_ROLES.includes(r));
}

function sumItems(items: Array<{ amount: number }>): number {
  return items.reduce((acc, it) => acc + it.amount, 0);
}

// ---- categories (drives the line-item dropdown) ----
expenseRouter.get("/categories", asyncHandler(async (_req: Request, res: Response) =>
  void ok(res, await prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }))
));

expenseRouter.post("/categories", canManage, validate({ body: CategorySchema }), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof CategorySchema>;
  const exists = await prisma.expenseCategory.findUnique({ where: { name: body.name } });
  if (exists) throw new BadRequestError(`Category "${body.name}" already exists`);
  const cat = await prisma.expenseCategory.create({ data: { name: body.name, maxAmount: body.maxAmount ?? null, requiresReceipt: body.requiresReceipt } });
  audit({ action: "expense.category_create", entity: "ExpenseCategory", entityId: cat.id, req });
  created(res, cat, "Category added.");
}));

// ---- summary (reviewer cards) ----
expenseRouter.get("/summary", canApprove, asyncHandler(async (_req: Request, res: Response) => {
  const [byStatus, pending, reimbursedAgg, pendingAgg] = await Promise.all([
    prisma.expenseReport.groupBy({ by: ["status"], _count: true }),
    prisma.expenseReport.count({ where: { status: { in: ["SUBMITTED", "PENDING_APPROVAL"] } } }),
    prisma.expenseReport.aggregate({ where: { status: "REIMBURSED" }, _sum: { totalAmount: true } }),
    prisma.expenseReport.aggregate({ where: { status: { in: ["SUBMITTED", "PENDING_APPROVAL"] } }, _sum: { totalAmount: true } }),
  ]);
  ok(res, {
    pendingCount: pending,
    pendingAmount: pendingAgg._sum.totalAmount ?? "0",
    reimbursedAmount: reimbursedAgg._sum.totalAmount ?? "0",
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
  });
}));

// ---- list ----
expenseRouter.get(
  "/",
  validate({ query: z.object({ status: z.string().optional(), scope: z.enum(["mine", "all"]).optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, scope } = req.query as Record<string, string | undefined>;
    const reviewerView = isReviewer(req) && scope !== "mine";
    const where: Prisma.ExpenseReportWhereInput = {
      ...(reviewerView ? {} : { employeeId: req.user!.employeeId ?? "none" }),
      ...(status ? { status: status as never } : {}),
    };
    const reports = await prisma.expenseReport.findMany({ where, orderBy: { createdAt: "desc" }, include: REPORT_INCLUDE, take: 300 });
    ok(res, { reports, reviewerView });
  })
);

expenseRouter.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const report = await prisma.expenseReport.findUnique({ where: { id: req.params["id"] as string }, include: REPORT_INCLUDE });
  if (!report) throw new NotFoundError("Expense report");
  if (!isReviewer(req) && report.employeeId !== req.user!.employeeId) throw new ForbiddenError("Not your expense report");
  ok(res, report);
}));

// ---- create (draft with line items) ----
expenseRouter.post("/", requirePermission(PERMISSIONS.EXPENSE_CREATE), validate({ body: CreateReportSchema }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
  const { title, items } = req.body as z.infer<typeof CreateReportSchema>;
  const categories = await prisma.expenseCategory.findMany({ where: { id: { in: items.map((i) => i.categoryId) }, isActive: true } });
  const catMap = new Map(categories.map((c) => [c.id, c]));
  for (const it of items) {
    const cat = catMap.get(it.categoryId);
    if (!cat) throw new BadRequestError("Invalid expense category");
    if (cat.maxAmount && it.amount > Number(cat.maxAmount)) throw new BadRequestError(`${cat.name} exceeds the per-claim cap of ₹${cat.maxAmount}`);
    if (cat.requiresReceipt && !it.receiptUrl) throw new BadRequestError(`${cat.name} requires a receipt`);
  }
  const report = await prisma.expenseReport.create({
    data: {
      employeeId: req.user.employeeId,
      title,
      totalAmount: sumItems(items),
      items: { create: items.map((it) => ({ categoryId: it.categoryId, date: it.date, amount: it.amount, description: it.description ?? null, receiptUrl: it.receiptUrl ?? null })) },
    },
    include: REPORT_INCLUDE,
  });
  audit({ action: "expense.create", entity: "ExpenseReport", entityId: report.id, req });
  created(res, report, "Expense report drafted.");
}));

async function loadOwnedDraft(req: Request): Promise<{ id: string }> {
  const id = req.params["id"] as string;
  const report = await prisma.expenseReport.findUnique({ where: { id } });
  if (!report) throw new NotFoundError("Expense report");
  if (report.employeeId !== req.user!.employeeId) throw new ForbiddenError("Not your expense report");
  if (report.status !== "DRAFT") throw new BadRequestError("Only draft reports can be edited");
  return { id };
}

expenseRouter.patch("/:id", validate({ body: UpdateReportSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = await loadOwnedDraft(req);
  const updated = await prisma.expenseReport.update({ where: { id }, data: { title: (req.body as z.infer<typeof UpdateReportSchema>).title }, include: REPORT_INCLUDE });
  ok(res, updated, "Report updated.");
}));

expenseRouter.post("/:id/items", validate({ body: ItemSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = await loadOwnedDraft(req);
  const it = req.body as z.infer<typeof ItemSchema>;
  const cat = await prisma.expenseCategory.findFirst({ where: { id: it.categoryId, isActive: true } });
  if (!cat) throw new BadRequestError("Invalid expense category");
  if (cat.maxAmount && it.amount > Number(cat.maxAmount)) throw new BadRequestError(`${cat.name} exceeds the per-claim cap of ₹${cat.maxAmount}`);
  await prisma.expenseItem.create({ data: { reportId: id, categoryId: it.categoryId, date: it.date, amount: it.amount, description: it.description ?? null, receiptUrl: it.receiptUrl ?? null } });
  await recomputeTotal(id);
  ok(res, await prisma.expenseReport.findUnique({ where: { id }, include: REPORT_INCLUDE }), "Line item added.");
}));

expenseRouter.delete("/:id/items/:itemId", asyncHandler(async (req: Request, res: Response) => {
  const { id } = await loadOwnedDraft(req);
  await prisma.expenseItem.deleteMany({ where: { id: req.params["itemId"] as string, reportId: id } });
  await recomputeTotal(id);
  noContent(res);
}));

async function recomputeTotal(reportId: string): Promise<void> {
  const items = await prisma.expenseItem.findMany({ where: { reportId }, select: { amount: true } });
  const total = items.reduce((acc, it) => acc + Number(it.amount), 0);
  await prisma.expenseReport.update({ where: { id: reportId }, data: { totalAmount: total } });
}

// ---- submit for approval ----
expenseRouter.post("/:id/submit", asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const report = await prisma.expenseReport.findUnique({ where: { id }, include: { items: true, employee: { select: { firstName: true, lastName: true, managerId: true } } } });
  if (!report) throw new NotFoundError("Expense report");
  if (report.employeeId !== req.user!.employeeId) throw new ForbiddenError("Not your expense report");
  if (report.status !== "DRAFT") throw new BadRequestError("Report already submitted");
  if (report.items.length === 0) throw new BadRequestError("Add at least one expense item before submitting");
  const updated = await prisma.expenseReport.update({ where: { id }, data: { status: "PENDING_APPROVAL", submittedAt: new Date() }, include: REPORT_INCLUDE });
  // notify approvers (manager + finance)
  const approvers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        ...(report.employee.managerId ? [{ employee: { id: report.employee.managerId } }] : []),
        { roles: { some: { role: { name: { in: ["FINANCE_MANAGER", "HR_ADMIN", "SUPER_ADMIN"] } } } } },
      ],
    },
    select: { id: true },
  });
  await notifyMany(approvers.map((u) => u.id), { type: "APPROVAL", title: `Expense claim: ${report.title}`, body: `${report.employee.firstName} ${report.employee.lastName} · ₹${updated.totalAmount}`, link: "/expenses" });
  audit({ action: "expense.submit", entity: "ExpenseReport", entityId: id, req });
  ok(res, updated, "Submitted for approval.");
}));

// ---- approve / reject ----
expenseRouter.patch("/:id/decide", canApprove, validate({ body: DecideSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const { decision, remarks } = req.body as z.infer<typeof DecideSchema>;
  const report = await prisma.expenseReport.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
  if (!report) throw new NotFoundError("Expense report");
  if (!["SUBMITTED", "PENDING_APPROVAL"].includes(report.status)) throw new BadRequestError("Report is not awaiting approval");
  const updated = await prisma.expenseReport.update({
    where: { id },
    data: { status: decision, approverId: req.user!.id, actedAt: new Date(), approverRemarks: remarks ?? null },
    include: REPORT_INCLUDE,
  });
  if (report.employee.userId) {
    await notify({
      userId: report.employee.userId,
      type: decision === "APPROVED" ? "SUCCESS" : "WARNING",
      title: `Expense ${decision.toLowerCase()}: ${updated.title}`,
      body: remarks ?? `₹${updated.totalAmount}`,
      link: "/expenses",
    });
  }
  audit({ action: "expense.decide", entity: "ExpenseReport", entityId: id, after: { decision }, req });
  ok(res, updated, `Expense ${decision.toLowerCase()}.`);
}));

// ---- mark reimbursed (finance) ----
expenseRouter.post("/:id/reimburse", canManage, validate({ body: ReimburseSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const { paidVia, reference } = req.body as z.infer<typeof ReimburseSchema>;
  const report = await prisma.expenseReport.findUnique({ where: { id }, include: { employee: { select: { userId: true } }, reimbursement: true } });
  if (!report) throw new NotFoundError("Expense report");
  if (report.status !== "APPROVED") throw new BadRequestError("Only approved reports can be reimbursed");
  await prisma.$transaction([
    prisma.reimbursement.upsert({
      where: { reportId: id },
      create: { reportId: id, amount: report.totalAmount, paidVia, reference: reference ?? null, paidAt: new Date() },
      update: { paidVia, reference: reference ?? null, paidAt: new Date() },
    }),
    prisma.expenseReport.update({ where: { id }, data: { status: "REIMBURSED" } }),
  ]);
  if (report.employee.userId) await notify({ userId: report.employee.userId, type: "SUCCESS", title: `Reimbursed: ${report.title}`, body: `₹${report.totalAmount} via ${paidVia.replace("_", " ").toLowerCase()}`, link: "/expenses" });
  audit({ action: "expense.reimburse", entity: "ExpenseReport", entityId: id, after: { paidVia }, req });
  ok(res, await prisma.expenseReport.findUnique({ where: { id }, include: REPORT_INCLUDE }), "Marked reimbursed.");
}));
