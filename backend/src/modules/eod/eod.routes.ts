// EOD — Daily Reporting. Employees submit end-of-day reports; managers review
// their team's, see missed reports and productivity. All DB-driven.
// RBAC: eod:read / eod:create (self) · eod:read_all / eod:review (managers).
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
import { notify } from "../notifications/notifications.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

const PERSON = { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, designation: { select: { title: true } } } };

const UpsertSchema = z.object({
  date: z.coerce.date(),
  project: z.string().max(120).optional(),
  tasksCompleted: z.string().min(3).max(8000),
  workInProgress: z.string().max(8000).optional(),
  blockers: z.string().max(4000).optional(),
  tomorrowPlan: z.string().max(4000).optional(),
  hoursWorked: z.number().min(0).max(24).default(0),
  comments: z.string().max(4000).optional(),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })).max(10).optional(),
  submit: z.boolean().default(false),
});

function dayOnly(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function isWeekend(d: Date): boolean { const w = d.getDay(); return w === 0 || w === 6; }

export const eodRouter: Router = Router();
eodRouter.use(requireAuth);
const canReadAll = requirePermission(PERMISSIONS.EOD_READ_ALL, PERMISSIONS.EOD_REVIEW);
const canReview = requirePermission(PERMISSIONS.EOD_REVIEW);

function meId(req: Request): string {
  if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
  return req.user.employeeId;
}
function isManager(req: Request): boolean {
  return req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE", "DEPARTMENT_HEAD", "MANAGER", "TEAM_LEAD"].includes(r));
}
async function scopeIds(req: Request): Promise<string[]> {
  // HR/Admin → everyone active; managers → their direct reports
  if (req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE"].includes(r))) {
    return (await prisma.employee.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "PROBATION", "ONBOARDING"] } }, select: { id: true } })).map((e) => e.id);
  }
  if (!req.user?.employeeId) return [];
  return (await prisma.employee.findMany({ where: { managerId: req.user.employeeId, deletedAt: null, status: { in: ["ACTIVE", "PROBATION"] } }, select: { id: true } })).map((e) => e.id);
}

// ── my reports ───────────────────────────────────────────────────────────────
eodRouter.get("/me", requirePermission(PERMISSIONS.EOD_READ), validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) return void ok(res, []);
  const { from, to } = req.query as { from?: Date; to?: Date };
  const where: Prisma.DailyReportWhereInput = { employeeId: req.user.employeeId, ...(from || to ? { date: { ...(from ? { gte: dayOnly(from) } : {}), ...(to ? { lte: dayOnly(to) } : {}) } } : {}) };
  ok(res, await prisma.dailyReport.findMany({ where, orderBy: { date: "desc" }, take: 120 }));
}));

eodRouter.get("/me/by-date", requirePermission(PERMISSIONS.EOD_READ), validate({ query: z.object({ date: z.coerce.date() }) }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) return void ok(res, null);
  const date = dayOnly(new Date(req.query["date"] as string));
  ok(res, await prisma.dailyReport.findUnique({ where: { employeeId_date: { employeeId: req.user.employeeId, date } } }));
}));

eodRouter.put("/", requirePermission(PERMISSIONS.EOD_CREATE), validate({ body: UpsertSchema }), asyncHandler(async (req: Request, res: Response) => {
  const employeeId = meId(req);
  const body = req.body as z.infer<typeof UpsertSchema>;
  const date = dayOnly(body.date);
  const existing = await prisma.dailyReport.findUnique({ where: { employeeId_date: { employeeId, date } } });
  if (existing?.status === "REVIEWED") throw new BadRequestError("This report has been reviewed and can no longer be edited");
  const data = {
    project: body.project ?? null,
    tasksCompleted: body.tasksCompleted,
    workInProgress: body.workInProgress ?? null,
    blockers: body.blockers ?? null,
    tomorrowPlan: body.tomorrowPlan ?? null,
    hoursWorked: body.hoursWorked,
    comments: body.comments ?? null,
    attachments: (body.attachments ?? null) as Prisma.InputJsonValue,
    status: (body.submit ? "SUBMITTED" : "DRAFT") as never,
    submittedAt: body.submit ? new Date() : existing?.submittedAt ?? null,
  };
  const report = await prisma.dailyReport.upsert({ where: { employeeId_date: { employeeId, date } }, create: { employeeId, date, ...data }, update: data });
  audit({ action: body.submit ? "eod.submit" : "eod.save", entity: "DailyReport", entityId: report.id, req });
  ok(res, report, body.submit ? "EOD submitted." : "Draft saved.");
}));

eodRouter.delete("/:id", requirePermission(PERMISSIONS.EOD_READ), asyncHandler(async (req: Request, res: Response) => {
  const report = await prisma.dailyReport.findUnique({ where: { id: req.params["id"] as string } });
  if (!report) throw new NotFoundError("Report");
  if (report.employeeId !== req.user!.employeeId) throw new ForbiddenError("Not your report");
  if (report.status === "REVIEWED") throw new BadRequestError("Reviewed reports cannot be deleted");
  await prisma.dailyReport.delete({ where: { id: report.id } });
  noContent(res);
}));

// ── my summary (week / month) ────────────────────────────────────────────────
eodRouter.get("/summary", requirePermission(PERMISSIONS.EOD_READ), validate({ query: z.object({ period: z.enum(["week", "month"]).default("week"), date: z.coerce.date().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) return void ok(res, { reports: 0, hours: 0, submitted: 0, byProject: [] });
  const ref = req.query["date"] ? new Date(req.query["date"] as string) : new Date();
  const start = dayOnly(ref); const end = dayOnly(ref);
  if ((req.query["period"] ?? "week") === "week") { start.setDate(start.getDate() - 6); }
  else { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
  const rows = await prisma.dailyReport.findMany({ where: { employeeId: req.user.employeeId, date: { gte: start, lte: end } } });
  const byProjectMap = new Map<string, number>();
  for (const r of rows) { const p = r.project ?? "Unassigned"; byProjectMap.set(p, (byProjectMap.get(p) ?? 0) + 1); }
  ok(res, {
    reports: rows.length,
    submitted: rows.filter((r) => r.status !== "DRAFT").length,
    byProject: [...byProjectMap.entries()].map(([project, count]) => ({ project, count })).sort((a, b) => b.count - a.count),
    range: { from: start, to: end },
  });
}));

// ── team (managers) ──────────────────────────────────────────────────────────
eodRouter.get("/team", canReadAll, validate({ query: z.object({ date: z.coerce.date().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const date = dayOnly(req.query["date"] ? new Date(req.query["date"] as string) : new Date());
  const ids = await scopeIds(req);
  const [people, reports] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: ids } }, ...PERSON, orderBy: { firstName: "asc" } }),
    prisma.dailyReport.findMany({ where: { employeeId: { in: ids }, date } }),
  ]);
  const byEmp = new Map(reports.map((r) => [r.employeeId, r]));
  ok(res, {
    date,
    rows: people.map((p) => ({ employee: p, report: byEmp.get(p.id) ?? null, status: byEmp.get(p.id)?.status ?? (isWeekend(date) ? "WEEKEND" : "MISSED") })),
  });
}));

eodRouter.get("/team/summary", canReadAll, validate({ query: z.object({ from: z.coerce.date(), to: z.coerce.date() }) }), asyncHandler(async (req: Request, res: Response) => {
  const from = dayOnly(new Date(req.query["from"] as string));
  const to = dayOnly(new Date(req.query["to"] as string));
  const ids = await scopeIds(req);
  const rows = await prisma.dailyReport.findMany({ where: { employeeId: { in: ids }, date: { gte: from, lte: to } }, include: { employee: PERSON } });
  const byEmp = new Map<string, { employee: unknown; reports: number; hours: number }>();
  for (const r of rows) {
    const cur = byEmp.get(r.employeeId) ?? { employee: r.employee, reports: 0, hours: 0 };
    cur.reports += 1; cur.hours += r.hoursWorked;
    byEmp.set(r.employeeId, cur);
  }
  ok(res, { from, to, team: ids.length, totalReports: rows.length, totalHours: Math.round(rows.reduce((t, r) => t + r.hoursWorked, 0) * 10) / 10, byEmployee: [...byEmp.values()].map((x) => ({ ...x, hours: Math.round(x.hours * 10) / 10 })) });
}));

eodRouter.patch("/:id/review", canReview, validate({ body: z.object({ reviewNote: z.string().max(2000).optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const report = await prisma.dailyReport.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
  if (!report) throw new NotFoundError("Report");
  const updated = await prisma.dailyReport.update({ where: { id }, data: { status: "REVIEWED", reviewedBy: req.user!.id, reviewedAt: new Date(), reviewNote: (req.body as { reviewNote?: string }).reviewNote ?? null } });
  if (report.employee.userId) await notify({ userId: report.employee.userId, type: "INFO", title: "Your EOD was reviewed", body: (req.body as { reviewNote?: string }).reviewNote ?? "Acknowledged by your manager.", link: "/eod" });
  audit({ action: "eod.review", entity: "DailyReport", entityId: id, req });
  ok(res, updated, "Report reviewed.");
}));

// ── dashboard ────────────────────────────────────────────────────────────────
eodRouter.get("/dashboard", canReadAll, asyncHandler(async (req: Request, res: Response) => {
  const today = dayOnly(new Date());
  const ids = await scopeIds(req);
  const weekAgo = dayOnly(new Date()); weekAgo.setDate(weekAgo.getDate() - 6);
  const [todays, weekCount] = await Promise.all([
    prisma.dailyReport.findMany({ where: { employeeId: { in: ids }, date: today }, select: { status: true } }),
    prisma.dailyReport.count({ where: { employeeId: { in: ids }, date: { gte: weekAgo, lte: today }, status: { not: "DRAFT" } } }),
  ]);
  const submittedToday = todays.filter((r) => r.status !== "DRAFT").length;
  const weekend = isWeekend(today);
  ok(res, {
    team: ids.length,
    submittedToday,
    pendingReview: todays.filter((r) => r.status === "SUBMITTED").length,
    missedToday: weekend ? 0 : Math.max(0, ids.length - todays.length),
    reportsThisWeek: weekCount,
  });
}));

// ── project productivity analytics ───────────────────────────────────────────
eodRouter.get("/analytics/projects", canReadAll, validate({ query: z.object({ from: z.coerce.date(), to: z.coerce.date() }) }), asyncHandler(async (req: Request, res: Response) => {
  const from = dayOnly(new Date(req.query["from"] as string));
  const to = dayOnly(new Date(req.query["to"] as string));
  const ids = await scopeIds(req);
  const rows = await prisma.dailyReport.findMany({ where: { employeeId: { in: ids }, date: { gte: from, lte: to } }, select: { project: true, hoursWorked: true, employeeId: true } });
  const map = new Map<string, { hours: number; reports: number; contributors: Set<string> }>();
  for (const r of rows) {
    const p = r.project ?? "Unassigned";
    const cur = map.get(p) ?? { hours: 0, reports: 0, contributors: new Set<string>() };
    cur.hours += r.hoursWorked; cur.reports += 1; cur.contributors.add(r.employeeId);
    map.set(p, cur);
  }
  ok(res, { from, to, projects: [...map.entries()].map(([project, v]) => ({ project, hours: Math.round(v.hours * 10) / 10, reports: v.reports, contributors: v.contributors.size })).sort((a, b) => b.hours - a.hours) });
}));

export { isManager };
