// Performance Management (Goals · KPIs · OKRs · Appraisal Cycles · Self/Manager/360
// reviews · Ratings · Promotions · Dashboard). Builds on the existing Prisma models.
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

const PERSON = { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, designation: { select: { title: true } }, department: { select: { name: true } } } };
const GOAL_STATUS = ["NOT_STARTED", "IN_PROGRESS", "ON_TRACK", "AT_RISK", "COMPLETED", "CANCELLED"] as const;

export const performanceRouter: Router = Router();
performanceRouter.use(requireAuth);
const canManage = requirePermission(PERMISSIONS.PERFORMANCE_MANAGE);
const canReview = requirePermission(PERMISSIONS.PERFORMANCE_APPROVE, PERMISSIONS.PERFORMANCE_MANAGE);
const canReadAll = requirePermission(PERMISSIONS.PERFORMANCE_READ_ALL, PERMISSIONS.PERFORMANCE_MANAGE);

function meId(req: Request): string {
  if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
  return req.user.employeeId;
}
/** null-safe variant for read endpoints — profile-less admins simply see nothing. */
function myEmpOrNull(req: Request): string | null {
  return req.user?.employeeId ?? null;
}
async function directReportIds(employeeId: string): Promise<string[]> {
  const reports = await prisma.employee.findMany({ where: { managerId: employeeId, deletedAt: null }, select: { id: true } });
  return reports.map((r) => r.id);
}
/** Can the caller act on this employee's performance data? self, manager-of, or HR. */
async function canActOn(req: Request, employeeId: string): Promise<boolean> {
  if (employeeId === req.user!.employeeId) return true;
  if (req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN"].includes(r))) return true;
  const reports = await directReportIds(meId(req));
  return reports.includes(employeeId);
}

// ═══════════════════════════ APPRAISAL CYCLES ═══════════════════════════
const CycleSchema = z.object({ name: z.string().min(2).max(80), startDate: z.coerce.date(), endDate: z.coerce.date() });

performanceRouter.get("/cycles", asyncHandler(async (_req: Request, res: Response) => {
  const cycles = await prisma.appraisalCycle.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { goals: true, objectives: true, managerReviews: true, selfAssessments: true } } },
  });
  ok(res, cycles);
}));

performanceRouter.post("/cycles", canManage, validate({ body: CycleSchema }), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof CycleSchema>;
  const exists = await prisma.appraisalCycle.findUnique({ where: { name: body.name } });
  if (exists) throw new BadRequestError(`Cycle "${body.name}" already exists`);
  const cycle = await prisma.appraisalCycle.create({ data: body });
  audit({ action: "perf.cycle_create", entity: "AppraisalCycle", entityId: cycle.id, req });
  created(res, cycle, "Appraisal cycle created.");
}));

performanceRouter.patch("/cycles/:id", canManage, validate({ body: z.object({ status: z.enum(["DRAFT", "ACTIVE", "REVIEW", "CALIBRATION", "CLOSED"]) }) }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const { status } = req.body as { status: string };
  const cycle = await prisma.appraisalCycle.update({ where: { id }, data: { status: status as never } });
  audit({ action: "perf.cycle_status", entity: "AppraisalCycle", entityId: id, after: { status }, req });
  ok(res, cycle, `Cycle moved to ${status.toLowerCase()}.`);
}));

// ═══════════════════════════ GOALS + KPIs ═══════════════════════════
const GoalSchema = z.object({
  cycleId: z.string().min(1),
  employeeId: z.string().optional(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  weight: z.number().min(0).max(100).default(0),
  metric: z.string().max(120).optional(),
  targetValue: z.number().optional(),
  dueDate: z.coerce.date().optional(),
});
const GoalUpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  weight: z.number().min(0).max(100).optional(),
  currentValue: z.number().optional(),
  targetValue: z.number().optional(),
  status: z.enum(GOAL_STATUS).optional(),
  dueDate: z.coerce.date().optional(),
});
const KpiSchema = z.object({ name: z.string().min(1).max(120), unit: z.string().max(20).optional(), targetValue: z.number(), actualValue: z.number().default(0) });

performanceRouter.get("/goals", validate({ query: z.object({ cycleId: z.string().optional(), employeeId: z.string().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const { cycleId, employeeId } = req.query as Record<string, string | undefined>;
  const targetEmployee = employeeId ?? myEmpOrNull(req);
  if (!targetEmployee) return void ok(res, []);
  if (employeeId && !(await canActOn(req, employeeId))) throw new ForbiddenError("Not your team member");
  const goals = await prisma.goal.findMany({
    where: { employeeId: targetEmployee, ...(cycleId ? { cycleId } : {}) },
    orderBy: { createdAt: "asc" },
    include: { kpis: true, cycle: { select: { name: true, status: true } } },
  });
  ok(res, goals);
}));

performanceRouter.post("/goals", requirePermission(PERMISSIONS.PERFORMANCE_CREATE), validate({ body: GoalSchema }), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof GoalSchema>;
  const employeeId = body.employeeId ?? meId(req);
  if (!(await canActOn(req, employeeId))) throw new ForbiddenError("Cannot set goals for this employee");
  const goal = await prisma.goal.create({
    data: { cycleId: body.cycleId, employeeId, title: body.title, description: body.description ?? null, weight: body.weight, metric: body.metric ?? null, targetValue: body.targetValue ?? null, dueDate: body.dueDate ?? null },
    include: { kpis: true },
  });
  audit({ action: "perf.goal_create", entity: "Goal", entityId: goal.id, req });
  created(res, goal, "Goal added.");
}));

performanceRouter.patch("/goals/:id", validate({ body: GoalUpdateSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) throw new NotFoundError("Goal");
  if (!(await canActOn(req, goal.employeeId))) throw new ForbiddenError("Not allowed");
  const updated = await prisma.goal.update({ where: { id }, data: req.body as z.infer<typeof GoalUpdateSchema> as never, include: { kpis: true } });
  ok(res, updated, "Goal updated.");
}));

performanceRouter.delete("/goals/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) throw new NotFoundError("Goal");
  if (!(await canActOn(req, goal.employeeId))) throw new ForbiddenError("Not allowed");
  await prisma.goal.delete({ where: { id } });
  noContent(res);
}));

performanceRouter.post("/goals/:id/kpis", validate({ body: KpiSchema }), asyncHandler(async (req: Request, res: Response) => {
  const goalId = req.params["id"] as string;
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) throw new NotFoundError("Goal");
  if (!(await canActOn(req, goal.employeeId))) throw new ForbiddenError("Not allowed");
  const kpi = await prisma.kpi.create({ data: { goalId, ...(req.body as z.infer<typeof KpiSchema>) } });
  created(res, kpi, "KPI added.");
}));

performanceRouter.patch("/kpis/:id", validate({ body: z.object({ actualValue: z.number().optional(), targetValue: z.number().optional(), name: z.string().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const kpi = await prisma.kpi.findUnique({ where: { id }, include: { goal: true } });
  if (!kpi) throw new NotFoundError("KPI");
  if (!(await canActOn(req, kpi.goal.employeeId))) throw new ForbiddenError("Not allowed");
  const updated = await prisma.kpi.update({ where: { id }, data: req.body as never });
  ok(res, updated, "KPI updated.");
}));

performanceRouter.delete("/kpis/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const kpi = await prisma.kpi.findUnique({ where: { id }, include: { goal: true } });
  if (!kpi) throw new NotFoundError("KPI");
  if (!(await canActOn(req, kpi.goal.employeeId))) throw new ForbiddenError("Not allowed");
  await prisma.kpi.delete({ where: { id } });
  noContent(res);
}));

// ═══════════════════════════ OKRs (Objectives + Key Results) ═══════════════════════════
const ObjectiveSchema = z.object({ cycleId: z.string().min(1), employeeId: z.string().optional(), title: z.string().min(3).max(200), description: z.string().max(2000).optional() });
const KeyResultSchema = z.object({ title: z.string().min(2).max(200), metric: z.string().max(120).optional(), startValue: z.number().default(0), targetValue: z.number(), currentValue: z.number().default(0) });

async function recomputeObjective(objectiveId: string): Promise<void> {
  const krs = await prisma.keyResult.findMany({ where: { objectiveId } });
  if (!krs.length) return;
  const pct = krs.reduce((acc, k) => {
    const span = k.targetValue - k.startValue;
    const ratio = span === 0 ? (k.currentValue >= k.targetValue ? 1 : 0) : (k.currentValue - k.startValue) / span;
    return acc + Math.max(0, Math.min(1, ratio));
  }, 0) / krs.length;
  const progress = Math.round(pct * 100);
  const status = progress >= 100 ? "COMPLETED" : progress > 0 ? "IN_PROGRESS" : "NOT_STARTED";
  await prisma.objective.update({ where: { id: objectiveId }, data: { progress, status: status as never } });
}

performanceRouter.get("/objectives", validate({ query: z.object({ cycleId: z.string().optional(), employeeId: z.string().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const { cycleId, employeeId } = req.query as Record<string, string | undefined>;
  const target = employeeId ?? myEmpOrNull(req);
  if (!target) return void ok(res, []);
  if (employeeId && !(await canActOn(req, employeeId))) throw new ForbiddenError("Not your team member");
  const objectives = await prisma.objective.findMany({ where: { employeeId: target, ...(cycleId ? { cycleId } : {}) }, orderBy: { createdAt: "asc" }, include: { keyResults: true } });
  ok(res, objectives);
}));

performanceRouter.post("/objectives", requirePermission(PERMISSIONS.PERFORMANCE_CREATE), validate({ body: ObjectiveSchema }), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof ObjectiveSchema>;
  const employeeId = body.employeeId ?? meId(req);
  if (!(await canActOn(req, employeeId))) throw new ForbiddenError("Not allowed");
  const obj = await prisma.objective.create({ data: { cycleId: body.cycleId, employeeId, title: body.title, description: body.description ?? null }, include: { keyResults: true } });
  audit({ action: "perf.objective_create", entity: "Objective", entityId: obj.id, req });
  created(res, obj, "Objective added.");
}));

performanceRouter.delete("/objectives/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const obj = await prisma.objective.findUnique({ where: { id } });
  if (!obj) throw new NotFoundError("Objective");
  if (!(await canActOn(req, obj.employeeId))) throw new ForbiddenError("Not allowed");
  await prisma.objective.delete({ where: { id } });
  noContent(res);
}));

performanceRouter.post("/objectives/:id/key-results", validate({ body: KeyResultSchema }), asyncHandler(async (req: Request, res: Response) => {
  const objectiveId = req.params["id"] as string;
  const obj = await prisma.objective.findUnique({ where: { id: objectiveId } });
  if (!obj) throw new NotFoundError("Objective");
  if (!(await canActOn(req, obj.employeeId))) throw new ForbiddenError("Not allowed");
  const kr = await prisma.keyResult.create({ data: { objectiveId, ...(req.body as z.infer<typeof KeyResultSchema>) } });
  await recomputeObjective(objectiveId);
  created(res, kr, "Key result added.");
}));

performanceRouter.patch("/key-results/:id", validate({ body: z.object({ currentValue: z.number().optional(), targetValue: z.number().optional(), status: z.enum(GOAL_STATUS).optional(), title: z.string().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const kr = await prisma.keyResult.findUnique({ where: { id }, include: { objective: true } });
  if (!kr) throw new NotFoundError("Key result");
  if (!(await canActOn(req, kr.objective.employeeId))) throw new ForbiddenError("Not allowed");
  const updated = await prisma.keyResult.update({ where: { id }, data: req.body as never });
  await recomputeObjective(kr.objectiveId);
  ok(res, updated, "Key result updated.");
}));

performanceRouter.delete("/key-results/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const kr = await prisma.keyResult.findUnique({ where: { id }, include: { objective: true } });
  if (!kr) throw new NotFoundError("Key result");
  if (!(await canActOn(req, kr.objective.employeeId))) throw new ForbiddenError("Not allowed");
  await prisma.keyResult.delete({ where: { id } });
  await recomputeObjective(kr.objectiveId);
  noContent(res);
}));

// ═══════════════════════════ SELF ASSESSMENT ═══════════════════════════
const SelfSchema = z.object({ cycleId: z.string().min(1), responses: z.record(z.string(), z.unknown()).default({}), overallComment: z.string().max(4000).optional(), rating: z.number().min(1).max(5).optional(), submit: z.boolean().default(false) });

performanceRouter.get("/self-assessment", validate({ query: z.object({ cycleId: z.string(), employeeId: z.string().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const cycleId = req.query["cycleId"] as string;
  const employeeId = (req.query["employeeId"] as string | undefined) ?? myEmpOrNull(req);
  if (!employeeId) return void ok(res, null);
  if (employeeId !== req.user!.employeeId && !(await canActOn(req, employeeId))) throw new ForbiddenError("Not allowed");
  const sa = await prisma.selfAssessment.findUnique({ where: { cycleId_employeeId: { cycleId, employeeId } } });
  ok(res, sa);
}));

performanceRouter.put("/self-assessment", requirePermission(PERMISSIONS.PERFORMANCE_CREATE), validate({ body: SelfSchema }), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof SelfSchema>;
  const employeeId = meId(req);
  const data = {
    responses: body.responses as never,
    overallComment: body.overallComment ?? null,
    rating: body.rating ?? null,
    status: (body.submit ? "SUBMITTED" : "IN_PROGRESS") as never,
    submittedAt: body.submit ? new Date() : null,
  };
  const sa = await prisma.selfAssessment.upsert({
    where: { cycleId_employeeId: { cycleId: body.cycleId, employeeId } },
    create: { cycleId: body.cycleId, employeeId, ...data },
    update: data,
  });
  audit({ action: body.submit ? "perf.self_submit" : "perf.self_save", entity: "SelfAssessment", entityId: sa.id, req });
  ok(res, sa, body.submit ? "Self-assessment submitted." : "Saved.");
}));

// ═══════════════════════════ MANAGER REVIEWS ═══════════════════════════
const ReviewSchema = z.object({
  cycleId: z.string().min(1),
  employeeId: z.string().min(1),
  responses: z.record(z.string(), z.unknown()).default({}),
  rating: z.number().min(1).max(5).optional(),
  promotionRecommended: z.boolean().default(false),
  comments: z.string().max(4000).optional(),
  submit: z.boolean().default(false),
});

// reviews I need to write (for my reports) in a cycle
performanceRouter.get("/reviews/team", canReview, validate({ query: z.object({ cycleId: z.string() }) }), asyncHandler(async (req: Request, res: Response) => {
  const cycleId = req.query["cycleId"] as string;
  const reportIds = req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN"].includes(r))
    ? (await prisma.employee.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "PROBATION"] } }, select: { id: true } })).map((e) => e.id)
    : await directReportIds(meId(req));
  const [people, reviews, selfs] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: reportIds } }, ...PERSON }),
    prisma.managerReview.findMany({ where: { cycleId, employeeId: { in: reportIds } } }),
    prisma.selfAssessment.findMany({ where: { cycleId, employeeId: { in: reportIds } }, select: { employeeId: true, status: true, rating: true } }),
  ]);
  const reviewBy = new Map(reviews.map((r) => [r.employeeId, r]));
  const selfBy = new Map(selfs.map((s) => [s.employeeId, s]));
  ok(res, people.map((p) => ({ employee: p, review: reviewBy.get(p.id) ?? null, self: selfBy.get(p.id) ?? null })));
}));

// reviews about me (acknowledge)
performanceRouter.get("/reviews/me", validate({ query: z.object({ cycleId: z.string().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const cycleId = req.query["cycleId"] as string | undefined;
  const myId = myEmpOrNull(req);
  if (!myId) return void ok(res, []);
  const reviews = await prisma.managerReview.findMany({
    where: { employeeId: myId, status: { in: ["SUBMITTED", "ACKNOWLEDGED"] }, ...(cycleId ? { cycleId } : {}) },
    include: { reviewer: PERSON, cycle: { select: { name: true } } },
    orderBy: { submittedAt: "desc" },
  });
  ok(res, reviews);
}));

performanceRouter.put("/reviews", canReview, validate({ body: ReviewSchema }), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof ReviewSchema>;
  if (!(await canActOn(req, body.employeeId))) throw new ForbiddenError("You can only review your team");
  const data = {
    reviewerId: meId(req),
    responses: body.responses as never,
    rating: body.rating ?? null,
    promotionRecommended: body.promotionRecommended,
    comments: body.comments ?? null,
    status: (body.submit ? "SUBMITTED" : "IN_PROGRESS") as never,
    submittedAt: body.submit ? new Date() : null,
  };
  const review = await prisma.managerReview.upsert({
    where: { cycleId_employeeId: { cycleId: body.cycleId, employeeId: body.employeeId } },
    create: { cycleId: body.cycleId, employeeId: body.employeeId, ...data },
    update: data,
  });
  if (body.submit) {
    const emp = await prisma.employee.findUnique({ where: { id: body.employeeId }, select: { userId: true } });
    if (emp?.userId) await notify({ userId: emp.userId, type: "INFO", title: "Your performance review is ready", body: "Review and acknowledge it in Performance.", link: "/performance" });
  }
  audit({ action: body.submit ? "perf.review_submit" : "perf.review_save", entity: "ManagerReview", entityId: review.id, req });
  ok(res, review, body.submit ? "Review submitted." : "Saved.");
}));

performanceRouter.post("/reviews/:id/acknowledge", asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const review = await prisma.managerReview.findUnique({ where: { id } });
  if (!review) throw new NotFoundError("Review");
  if (review.employeeId !== req.user!.employeeId) throw new ForbiddenError("Not your review");
  const updated = await prisma.managerReview.update({ where: { id }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() } });
  audit({ action: "perf.review_ack", entity: "ManagerReview", entityId: id, req });
  ok(res, updated, "Review acknowledged.");
}));

// ═══════════════════════════ 360 FEEDBACK ═══════════════════════════
const FeedbackSchema = z.object({
  cycleId: z.string().min(1),
  subjectId: z.string().min(1),
  relationship: z.enum(["PEER", "REPORT", "STAKEHOLDER", "MANAGER"]),
  responses: z.record(z.string(), z.unknown()).default({}),
  rating: z.number().min(1).max(5).optional(),
  isAnonymous: z.boolean().default(true),
});

performanceRouter.post("/feedback", requirePermission(PERMISSIONS.PERFORMANCE_CREATE), validate({ body: FeedbackSchema }), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof FeedbackSchema>;
  if (body.subjectId === meId(req)) throw new BadRequestError("You can't give 360 feedback on yourself");
  const fb = await prisma.feedback360.upsert({
    where: { cycleId_subjectId_giverId: { cycleId: body.cycleId, subjectId: body.subjectId, giverId: meId(req) } },
    create: { cycleId: body.cycleId, subjectId: body.subjectId, giverId: meId(req), relationship: body.relationship, responses: body.responses as never, rating: body.rating ?? null, isAnonymous: body.isAnonymous, submittedAt: new Date() },
    update: { relationship: body.relationship, responses: body.responses as never, rating: body.rating ?? null, isAnonymous: body.isAnonymous, submittedAt: new Date() },
  });
  audit({ action: "perf.feedback_360", entity: "Feedback360", entityId: fb.id, req });
  created(res, fb, "360° feedback submitted.");
}));

// feedback about an employee (HR/manager view; anonymised givers)
performanceRouter.get("/feedback", canReadAll, validate({ query: z.object({ cycleId: z.string(), subjectId: z.string() }) }), asyncHandler(async (req: Request, res: Response) => {
  const { cycleId, subjectId } = req.query as Record<string, string>;
  const rows = await prisma.feedback360.findMany({ where: { cycleId, subjectId }, include: { giver: PERSON }, orderBy: { createdAt: "desc" } });
  ok(res, rows.map((r) => ({
    id: r.id, relationship: r.relationship, responses: r.responses, rating: r.rating, submittedAt: r.submittedAt,
    giver: r.isAnonymous ? null : r.giver,
  })));
}));

// ═══════════════════════════ PROMOTIONS ═══════════════════════════
performanceRouter.get("/promotions", canReadAll, validate({ query: z.object({ cycleId: z.string().optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const cycleId = req.query["cycleId"] as string | undefined;
  const reviews = await prisma.managerReview.findMany({
    where: { promotionRecommended: true, status: { in: ["SUBMITTED", "ACKNOWLEDGED"] }, ...(cycleId ? { cycleId } : {}) },
    include: { employee: PERSON, reviewer: PERSON, cycle: { select: { name: true } } },
    orderBy: { rating: "desc" },
  });
  ok(res, reviews);
}));

// ═══════════════════════════ DASHBOARD ═══════════════════════════
performanceRouter.get("/dashboard", canReadAll, validate({ query: z.object({ cycleId: z.string() }) }), asyncHandler(async (req: Request, res: Response) => {
  const cycleId = req.query["cycleId"] as string;
  const [reviews, selfs, goals, objectives, promo, fbCount] = await Promise.all([
    prisma.managerReview.findMany({ where: { cycleId }, select: { rating: true, status: true } }),
    prisma.selfAssessment.count({ where: { cycleId, status: "SUBMITTED" } }),
    prisma.goal.findMany({ where: { cycleId }, select: { status: true } }),
    prisma.objective.findMany({ where: { cycleId }, select: { progress: true } }),
    prisma.managerReview.count({ where: { cycleId, promotionRecommended: true } }),
    prisma.feedback360.count({ where: { cycleId } }),
  ]);
  const ratings = reviews.filter((r) => r.rating != null).map((r) => r.rating as number);
  const dist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const r of ratings) dist[String(Math.round(r))] = (dist[String(Math.round(r))] ?? 0) + 1;
  const goalsDone = goals.filter((g) => g.status === "COMPLETED").length;
  ok(res, {
    reviewsSubmitted: reviews.filter((r) => r.status === "SUBMITTED" || r.status === "ACKNOWLEDGED").length,
    reviewsTotal: reviews.length,
    selfSubmitted: selfs,
    avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : null,
    ratingDistribution: dist,
    goalsTotal: goals.length,
    goalsCompleted: goalsDone,
    goalCompletionPct: goals.length ? Math.round((goalsDone / goals.length) * 100) : 0,
    avgObjectiveProgress: objectives.length ? Math.round(objectives.reduce((a, o) => a + o.progress, 0) / objectives.length) : 0,
    promotionCandidates: promo,
    feedback360Count: fbCount,
  });
}));

// top performers (by manager rating in a cycle)
performanceRouter.get("/top-performers", canReadAll, validate({ query: z.object({ cycleId: z.string() }) }), asyncHandler(async (req: Request, res: Response) => {
  const cycleId = req.query["cycleId"] as string;
  const reviews = await prisma.managerReview.findMany({
    where: { cycleId, rating: { not: null }, status: { in: ["SUBMITTED", "ACKNOWLEDGED"] } },
    include: { employee: PERSON },
    orderBy: { rating: "desc" },
    take: 10,
  });
  ok(res, reviews.map((r) => ({ employee: r.employee, rating: r.rating, promotionRecommended: r.promotionRecommended })));
}));
