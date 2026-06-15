// Announcements & Company Feed — org-wide posts with audience targeting,
// pinning, reactions and comments. (RBAC: announcement:read / announcement:manage)
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
import { notifyMany } from "../notifications/notifications.service.js";
import { mailService } from "../notifications/mail.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

const CATEGORIES = ["GENERAL", "POLICY", "EVENT", "CELEBRATION", "ACHIEVEMENT", "URGENT"] as const;
const PERSON = { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, designation: { select: { title: true } } } };

const CreateSchema = z.object({
  title: z.string().min(3).max(160),
  body: z.string().min(3).max(20000),
  category: z.enum(CATEGORIES).default("GENERAL"),
  isPinned: z.boolean().default(false),
  expiresAt: z.coerce.date().optional(),
  audience: z.object({ departmentIds: z.array(z.string()).optional(), locationIds: z.array(z.string()).optional() }).optional(),
});
const UpdateSchema = CreateSchema.partial();
const CommentSchema = z.object({ body: z.string().min(1).max(2000) });
const ReactSchema = z.object({ emoji: z.string().min(1).max(8).default("👍") });

type Audience = { departmentIds?: string[]; locationIds?: string[] } | null;

export const announcementsRouter: Router = Router();
announcementsRouter.use(requireAuth);
const canManage = requirePermission(PERMISSIONS.ANNOUNCEMENT_MANAGE);
const canRead = requirePermission(PERMISSIONS.ANNOUNCEMENT_READ);

function visibleTo(audience: Audience, dept: string | null, loc: string | null): boolean {
  if (!audience) return true;
  const depMatch = !audience.departmentIds?.length || (dept != null && audience.departmentIds.includes(dept));
  const locMatch = !audience.locationIds?.length || (loc != null && audience.locationIds.includes(loc));
  return depMatch && locMatch;
}

async function myDeptLoc(req: Request): Promise<{ dept: string | null; loc: string | null }> {
  if (!req.user?.employeeId) return { dept: null, loc: null };
  const e = await prisma.employee.findUnique({ where: { id: req.user.employeeId }, select: { departmentId: true, locationId: true } });
  return { dept: e?.departmentId ?? null, loc: e?.locationId ?? null };
}

function shape(a: { reactions: { employeeId: string; emoji: string }[]; _count?: { comments: number } } & Record<string, unknown>, meId: string | null) {
  const reactions = a.reactions as { employeeId: string; emoji: string }[];
  const { reactions: _r, ...rest } = a;
  return {
    ...rest,
    reactionCount: reactions.length,
    reacted: meId ? reactions.some((r) => r.employeeId === meId) : false,
    commentCount: (a._count as { comments: number } | undefined)?.comments ?? 0,
  };
}

// ── feed ─────────────────────────────────────────────────────────────────────
announcementsRouter.get(
  "/",
  canRead,
  validate({ query: z.object({ category: z.string().optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { category } = req.query as Record<string, string | undefined>;
    const { dept, loc } = await myDeptLoc(req);
    const isManager = req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN"].includes(r));
    const rows = await prisma.announcementPost.findMany({
      where: {
        ...(category ? { category: category as never } : {}),
        ...(isManager ? {} : { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }),
      },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 100,
      include: { author: PERSON, reactions: { select: { employeeId: true, emoji: true } }, _count: { select: { comments: true } } },
    });
    // audience filter (managers see all)
    const filtered = isManager ? rows : rows.filter((a) => visibleTo(a.audience as Audience, dept, loc));
    ok(res, filtered.map((a) => shape(a, req.user!.employeeId)));
  })
);

announcementsRouter.get("/:id", canRead, asyncHandler(async (req: Request, res: Response) => {
  const a = await prisma.announcementPost.findUnique({
    where: { id: req.params["id"] as string },
    include: { author: PERSON, reactions: { select: { employeeId: true, emoji: true } }, comments: { orderBy: { createdAt: "asc" }, include: { author: PERSON } }, _count: { select: { comments: true } } },
  });
  if (!a) throw new NotFoundError("Announcement");
  ok(res, shape(a, req.user!.employeeId));
}));

// ── create / update / delete (HR) ────────────────────────────────────────────
announcementsRouter.post("/", canManage, validate({ body: CreateSchema }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) throw new BadRequestError("Only employees with a profile can post announcements");
  const body = req.body as z.infer<typeof CreateSchema>;
  const post = await prisma.announcementPost.create({
    data: {
      authorEmployeeId: req.user.employeeId,
      title: body.title, body: body.body, category: body.category, isPinned: body.isPinned,
      expiresAt: body.expiresAt ?? null,
      audience: (body.audience ?? null) as Prisma.InputJsonValue,
    },
    include: { author: PERSON, reactions: true, _count: { select: { comments: true } } },
  });
  // notify the targeted audience (or everyone) — keep it to active users with a login
  const where: Prisma.EmployeeWhereInput = {
    deletedAt: null, status: { in: ["ACTIVE", "PROBATION", "ONBOARDING"] }, userId: { not: null },
    ...(body.audience?.departmentIds?.length ? { departmentId: { in: body.audience.departmentIds } } : {}),
    ...(body.audience?.locationIds?.length ? { locationId: { in: body.audience.locationIds } } : {}),
  };
  const targets = await prisma.employee.findMany({ where, select: { userId: true, user: { select: { email: true } } } });
  const userIds = targets.map((t) => t.userId).filter((u): u is string => Boolean(u));
  if (userIds.length) await notifyMany(userIds, { type: body.category === "URGENT" ? "ALERT" : "INFO", title: `📣 ${body.title}`, body: body.body.slice(0, 120), link: "/feed" });
  // email the targeted audience (background, non-blocking)
  const emails = targets.map((t) => t.user?.email).filter((e): e is string => Boolean(e));
  if (emails.length) {
    const author = `${post.author.firstName} ${post.author.lastName}`.trim();
    mailService.broadcastAnnouncement(emails, { title: body.title, body: body.body, author });
  }
  audit({ action: "announcement.create", entity: "AnnouncementPost", entityId: post.id, req });
  created(res, shape({ ...post, reactions: [] }, req.user.employeeId), "Announcement published.");
}));

announcementsRouter.patch("/:id", canManage, validate({ body: UpdateSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const body = req.body as z.infer<typeof UpdateSchema>;
  const data: Prisma.AnnouncementPostUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.body !== undefined) data.body = body.body;
  if (body.category !== undefined) data.category = body.category;
  if (body.isPinned !== undefined) data.isPinned = body.isPinned;
  if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt;
  if (body.audience !== undefined) data.audience = (body.audience ?? null) as Prisma.InputJsonValue;
  const post = await prisma.announcementPost.update({ where: { id }, data });
  audit({ action: "announcement.update", entity: "AnnouncementPost", entityId: id, req });
  ok(res, post, "Announcement updated.");
}));

announcementsRouter.delete("/:id", canManage, asyncHandler(async (req: Request, res: Response) => {
  await prisma.announcementPost.delete({ where: { id: req.params["id"] as string } });
  audit({ action: "announcement.delete", entity: "AnnouncementPost", entityId: req.params["id"] as string, req });
  noContent(res);
}));

// ── reactions ────────────────────────────────────────────────────────────────
announcementsRouter.post("/:id/react", canRead, validate({ body: ReactSchema }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
  const announcementId = req.params["id"] as string;
  const { emoji } = req.body as z.infer<typeof ReactSchema>;
  const key = { announcementId_employeeId: { announcementId, employeeId: req.user.employeeId } };
  const existing = await prisma.announcementReaction.findUnique({ where: key });
  if (existing && existing.emoji === emoji) await prisma.announcementReaction.delete({ where: key });
  else if (existing) await prisma.announcementReaction.update({ where: key, data: { emoji } });
  else await prisma.announcementReaction.create({ data: { announcementId, employeeId: req.user.employeeId, emoji } });
  const count = await prisma.announcementReaction.count({ where: { announcementId } });
  ok(res, { reacted: !(existing && existing.emoji === emoji), reactionCount: count });
}));

// ── comments ─────────────────────────────────────────────────────────────────
announcementsRouter.post("/:id/comments", canRead, validate({ body: CommentSchema }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
  const announcementId = req.params["id"] as string;
  const a = await prisma.announcementPost.findUnique({ where: { id: announcementId }, select: { id: true } });
  if (!a) throw new NotFoundError("Announcement");
  const comment = await prisma.announcementComment.create({
    data: { announcementId, authorEmployeeId: req.user.employeeId, body: (req.body as z.infer<typeof CommentSchema>).body },
    include: { author: PERSON },
  });
  created(res, comment, "Comment added.");
}));

announcementsRouter.delete("/:id/comments/:cid", canRead, asyncHandler(async (req: Request, res: Response) => {
  const cid = req.params["cid"] as string;
  const comment = await prisma.announcementComment.findUnique({ where: { id: cid }, select: { authorEmployeeId: true } });
  if (!comment) throw new NotFoundError("Comment");
  const canModerate = req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN"].includes(r));
  if (comment.authorEmployeeId !== req.user!.employeeId && !canModerate) throw new ForbiddenError("Not your comment");
  await prisma.announcementComment.delete({ where: { id: cid } });
  noContent(res);
}));
