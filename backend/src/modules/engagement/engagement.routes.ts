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

const BADGES = ["KUDOS", "TEAM_PLAYER", "INNOVATION", "LEADERSHIP", "CUSTOMER_FIRST", "ABOVE_AND_BEYOND", "MILESTONE", "WELCOME"] as const;

const CreateSchema = z.object({
  toEmployeeId: z.string().min(1),
  badge: z.enum(BADGES).default("KUDOS"),
  message: z.string().min(3).max(1000),
  isPublic: z.boolean().default(true),
});

const PERSON = { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, designation: { select: { title: true } } } };

export const engagementRouter: Router = Router();
engagementRouter.use(requireAuth);

function shape(r: { cheers: { employeeId: string }[] } & Record<string, unknown>, meId: string | null) {
  const cheers = r.cheers as { employeeId: string }[];
  const { cheers: _c, ...rest } = r;
  return { ...rest, cheerCount: cheers.length, cheered: meId ? cheers.some((c) => c.employeeId === meId) : false };
}

// ── recognition wall ─────────────────────────────────────────────────────────
engagementRouter.get(
  "/recognition",
  requirePermission(PERMISSIONS.RECOGNITION_READ),
  validate({ query: z.object({ scope: z.enum(["feed", "received", "given"]).optional(), badge: z.string().optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { scope, badge } = req.query as Record<string, string | undefined>;
    const me = req.user!.employeeId;
    const where: Prisma.RecognitionWhereInput = {
      ...(scope === "received" ? { toEmployeeId: me ?? "none" } : scope === "given" ? { fromEmployeeId: me ?? "none" } : { isPublic: true }),
      ...(badge ? { badge: badge as never } : {}),
    };
    const rows = await prisma.recognition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { from: PERSON, to: PERSON, cheers: { select: { employeeId: true } } },
    });
    ok(res, rows.map((r) => shape(r, me)));
  })
);

// leaderboard — most-recognised this calendar month
engagementRouter.get("/recognition/leaderboard", requirePermission(PERMISSIONS.RECOGNITION_READ), asyncHandler(async (_req: Request, res: Response) => {
  const start = new Date();
  start.setDate(1); start.setHours(0, 0, 0, 0);
  const grouped = await prisma.recognition.groupBy({ by: ["toEmployeeId"], where: { createdAt: { gte: start } }, _count: true, orderBy: { _count: { toEmployeeId: "desc" } }, take: 5 });
  const ids = grouped.map((g) => g.toEmployeeId);
  const people = ids.length ? await prisma.employee.findMany({ where: { id: { in: ids } }, ...PERSON }) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  ok(res, grouped.map((g) => ({ employee: byId.get(g.toEmployeeId), count: g._count })).filter((x) => x.employee));
}));

// recognitions received by one employee (profile wall)
engagementRouter.get("/recognition/wall/:employeeId", requirePermission(PERMISSIONS.RECOGNITION_READ), asyncHandler(async (req: Request, res: Response) => {
  const rows = await prisma.recognition.findMany({
    where: { toEmployeeId: req.params["employeeId"] as string, isPublic: true },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { from: PERSON, to: PERSON, cheers: { select: { employeeId: true } } },
  });
  ok(res, rows.map((r) => shape(r, req.user!.employeeId)));
}));

engagementRouter.post("/recognition", requirePermission(PERMISSIONS.RECOGNITION_CREATE), validate({ body: CreateSchema }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
  const body = req.body as z.infer<typeof CreateSchema>;
  if (body.toEmployeeId === req.user.employeeId) throw new BadRequestError("You can't recognise yourself");
  const target = await prisma.employee.findFirst({ where: { id: body.toEmployeeId, deletedAt: null }, select: { id: true, userId: true, firstName: true } });
  if (!target) throw new NotFoundError("Employee");
  const rec = await prisma.recognition.create({
    data: { fromEmployeeId: req.user.employeeId, toEmployeeId: body.toEmployeeId, badge: body.badge, message: body.message, isPublic: body.isPublic },
    include: { from: PERSON, to: PERSON, cheers: { select: { employeeId: true } } },
  });
  if (target.userId) await notify({ userId: target.userId, type: "SUCCESS", title: "You received recognition! 🎉", body: body.message.slice(0, 120), link: "/celebrations" });
  audit({ action: "recognition.create", entity: "Recognition", entityId: rec.id, req });
  created(res, shape(rec, req.user.employeeId), "Recognition shared 🎉");
}));

engagementRouter.post("/recognition/:id/cheer", requirePermission(PERMISSIONS.RECOGNITION_READ), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
  const recognitionId = req.params["id"] as string;
  const exists = await prisma.recognition.findUnique({ where: { id: recognitionId }, select: { id: true } });
  if (!exists) throw new NotFoundError("Recognition");
  const key = { recognitionId_employeeId: { recognitionId, employeeId: req.user.employeeId } };
  const already = await prisma.recognitionCheer.findUnique({ where: key });
  if (already) await prisma.recognitionCheer.delete({ where: key });
  else await prisma.recognitionCheer.create({ data: { recognitionId, employeeId: req.user.employeeId } });
  const count = await prisma.recognitionCheer.count({ where: { recognitionId } });
  ok(res, { cheered: !already, cheerCount: count });
}));

engagementRouter.delete("/recognition/:id", requirePermission(PERMISSIONS.RECOGNITION_READ), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const rec = await prisma.recognition.findUnique({ where: { id }, select: { fromEmployeeId: true } });
  if (!rec) throw new NotFoundError("Recognition");
  const canModerate = req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN"].includes(r));
  if (rec.fromEmployeeId !== req.user!.employeeId && !canModerate) throw new ForbiddenError("You can only delete your own recognition");
  await prisma.recognition.delete({ where: { id } });
  audit({ action: "recognition.delete", entity: "Recognition", entityId: id, req });
  noContent(res);
}));

// ── new joiners (welcome feed) ───────────────────────────────────────────────
engagementRouter.get("/new-joiners", validate({ query: z.object({ days: z.coerce.number().int().min(1).max(120).optional() }) }), asyncHandler(async (req: Request, res: Response) => {
  const days = Number(req.query["days"] ?? 30);
  const since = new Date(Date.now() - days * 86400000);
  const joiners = await prisma.employee.findMany({
    where: { deletedAt: null, status: { in: ["ONBOARDING", "PROBATION", "ACTIVE"] }, dateOfJoining: { gte: since, lte: new Date() } },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, dateOfJoining: true, department: { select: { name: true } }, designation: { select: { title: true } } },
    orderBy: { dateOfJoining: "desc" },
    take: 50,
  });
  ok(res, joiners);
}));
