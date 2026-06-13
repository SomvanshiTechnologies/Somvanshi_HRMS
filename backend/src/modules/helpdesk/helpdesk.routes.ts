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
import type { Prisma } from "../../generated/prisma/client.js";

const DEPARTMENTS = ["HR", "IT", "FINANCE", "ADMIN"] as const;

const CreateTicketSchema = z.object({
  categoryId: z.string().min(1),
  subject: z.string().min(3).max(200),
  description: z.string().min(5).max(5000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
});
const CommentSchema = z.object({ body: z.string().min(1).max(5000), isInternal: z.boolean().default(false) });
const AssignSchema = z.object({ assigneeId: z.string().min(1) });
const StatusSchema = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED", "REOPENED"]) });

async function nextTicketNumber(): Promise<string> {
  const last = await prisma.ticket.findFirst({ orderBy: { ticketNumber: "desc" }, select: { ticketNumber: true } });
  const n = last ? parseInt(last.ticketNumber.replace(/\D/g, ""), 10) : 0;
  return `SOM-TKT-${String(n + 1).padStart(5, "0")}`;
}

const TICKET_INCLUDE = {
  category: { select: { id: true, name: true, department: true } },
  requester: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true } },
  assignee: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
  _count: { select: { comments: true } },
};

export const helpdeskRouter: Router = Router();
helpdeskRouter.use(requireAuth);
const canAssign = requirePermission(PERMISSIONS.HELPDESK_ASSIGN, PERMISSIONS.HELPDESK_MANAGE);

/** Agents see tickets in departments they manage; everyone sees their own. */
function isAgent(req: Request): boolean {
  return req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE"].includes(r));
}

// categories (drives the create dropdown)
helpdeskRouter.get("/categories", asyncHandler(async (_req: Request, res: Response) =>
  void ok(res, await prisma.ticketCategory.findMany({ where: { isActive: true }, orderBy: [{ department: "asc" }, { name: "asc" }], include: { slaPolicy: true } }))
));

// summary
helpdeskRouter.get("/summary", requirePermission(PERMISSIONS.HELPDESK_ASSIGN, PERMISSIONS.HELPDESK_MANAGE), asyncHandler(async (_req: Request, res: Response) => {
  const [byStatus, byPriority, breached, open] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], _count: true }),
    prisma.ticket.groupBy({ by: ["priority"], where: { status: { notIn: ["RESOLVED", "CLOSED"] } }, _count: true }),
    prisma.ticket.count({ where: { slaBreached: true, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    prisma.ticket.count({ where: { status: { notIn: ["RESOLVED", "CLOSED"] } } }),
  ]);
  ok(res, {
    open, slaBreached: breached,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count])),
  });
}));

// list (board) — agents see all, employees see own
helpdeskRouter.get(
  "/tickets",
  validate({ query: z.object({ status: z.string().optional(), department: z.string().optional(), priority: z.string().optional(), scope: z.enum(["mine", "all"]).optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, department, priority, scope } = req.query as Record<string, string | undefined>;
    const agentView = isAgent(req) && scope !== "mine";
    const where: Prisma.TicketWhereInput = {
      ...(agentView ? {} : { requesterId: req.user!.employeeId ?? "none" }),
      ...(status ? { status: status as never } : {}),
      ...(department ? { department: department as never } : {}),
      ...(priority ? { priority: priority as never } : {}),
    };
    const tickets = await prisma.ticket.findMany({ where, orderBy: [{ createdAt: "desc" }], include: TICKET_INCLUDE, take: 300 });
    ok(res, { tickets, agentView });
  })
);

helpdeskRouter.get("/tickets/:id", asyncHandler(async (req: Request, res: Response) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params["id"] as string },
    include: { ...TICKET_INCLUDE, comments: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) throw new NotFoundError("Ticket");
  if (!isAgent(req) && ticket.requesterId !== req.user!.employeeId) throw new ForbiddenError("Not your ticket");
  // hide internal comments from requester
  if (!isAgent(req)) ticket.comments = ticket.comments.filter((c) => !c.isInternal);
  ok(res, ticket);
}));

// create
helpdeskRouter.post("/tickets", requirePermission(PERMISSIONS.HELPDESK_CREATE), validate({ body: CreateTicketSchema }), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.employeeId) throw new BadRequestError("No employee profile linked");
  const category = await prisma.ticketCategory.findUnique({ where: { id: req.body.categoryId } });
  if (!category) throw new NotFoundError("Category");
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: await nextTicketNumber(),
      categoryId: category.id,
      department: category.department,
      requesterId: req.user.employeeId,
      subject: req.body.subject,
      description: req.body.description,
      priority: req.body.priority,
    },
    include: TICKET_INCLUDE,
  });
  // notify agents of that department
  const agents = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["HR_ADMIN", "HR_EXECUTIVE", "SUPER_ADMIN"] } } } } },
    select: { id: true },
  });
  await notifyMany(agents.map((u) => u.id), { type: "ALERT", title: `New ${category.department} ticket: ${ticket.subject}`, body: `${ticket.ticketNumber} · ${ticket.priority}`, link: "/helpdesk" });
  audit({ action: "ticket.create", entity: "Ticket", entityId: ticket.id, req });
  created(res, ticket, `Ticket ${ticket.ticketNumber} raised.`);
}));

// comment
helpdeskRouter.post("/tickets/:id/comments", validate({ body: CommentSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: { requester: { select: { userId: true } }, assignee: { select: { userId: true } } } });
  if (!ticket) throw new NotFoundError("Ticket");
  const agent = isAgent(req);
  if (!agent && ticket.requesterId !== req.user!.employeeId) throw new ForbiddenError("Not your ticket");
  const { body, isInternal } = req.body as z.infer<typeof CommentSchema>;
  const comment = await prisma.ticketComment.create({
    data: { ticketId: id, authorId: req.user!.id, body, isInternal: agent ? isInternal : false },
  });
  if (!ticket.firstRespondedAt && agent) await prisma.ticket.update({ where: { id }, data: { firstRespondedAt: new Date() } });
  // notify the other party
  const target = req.user!.id === ticket.requester.userId ? ticket.assignee?.userId : ticket.requester.userId;
  if (target && !(isInternal && agent)) await notify({ userId: target, type: "INFO", title: `Reply on ${ticket.ticketNumber}`, body: body.slice(0, 120), link: "/helpdesk" });
  audit({ action: "ticket.comment", entity: "Ticket", entityId: id, req });
  created(res, comment);
}));

// assign
helpdeskRouter.patch("/tickets/:id/assign", canAssign, validate({ body: AssignSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const { assigneeId } = req.body as z.infer<typeof AssignSchema>;
  const assignee = await prisma.employee.findFirst({ where: { id: assigneeId, deletedAt: null }, select: { id: true, userId: true } });
  if (!assignee) throw new NotFoundError("Assignee");
  const ticket = await prisma.ticket.update({ where: { id }, data: { assigneeId, status: "IN_PROGRESS" }, include: TICKET_INCLUDE });
  if (assignee.userId) await notify({ userId: assignee.userId, type: "APPROVAL", title: `Ticket assigned: ${ticket.subject}`, body: ticket.ticketNumber, link: "/helpdesk" });
  audit({ action: "ticket.assign", entity: "Ticket", entityId: id, after: { assigneeId }, req });
  ok(res, ticket, "Ticket assigned.");
}));

// status
helpdeskRouter.patch("/tickets/:id/status", validate({ body: StatusSchema }), asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const { status } = req.body as z.infer<typeof StatusSchema>;
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: { requester: { select: { userId: true } } } });
  if (!ticket) throw new NotFoundError("Ticket");
  const agent = isAgent(req);
  // requesters may only close/reopen their own ticket
  if (!agent) {
    if (ticket.requesterId !== req.user!.employeeId || !["CLOSED", "REOPENED"].includes(status)) throw new ForbiddenError("Not allowed");
  }
  const updated = await prisma.ticket.update({
    where: { id },
    data: {
      status,
      ...(status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
      ...(status === "CLOSED" ? { closedAt: new Date() } : {}),
      ...(status === "REOPENED" ? { resolvedAt: null, closedAt: null } : {}),
    },
    include: TICKET_INCLUDE,
  });
  if (status === "RESOLVED" && ticket.requester.userId) {
    await notify({ userId: ticket.requester.userId, type: "SUCCESS", title: `${ticket.ticketNumber} resolved`, body: ticket.subject, link: "/helpdesk" });
  }
  audit({ action: "ticket.status", entity: "Ticket", entityId: id, after: { status }, req });
  ok(res, updated, `Ticket ${status.toLowerCase()}.`);
}));
