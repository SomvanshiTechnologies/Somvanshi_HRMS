import crypto from "node:crypto";
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
import { notify } from "../notifications/notifications.service.js";

const StartSchema = z.object({ employeeId: z.string().min(1), templateId: z.string().optional() });
const TaskActionSchema = z.object({ action: z.enum(["complete", "skip"]), remarks: z.string().max(500).optional() });
const SignSchema = z.object({ typedName: z.string().min(2).max(120) });

const INSTANCE_INCLUDE = {
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, userId: true, department: { select: { name: true } } } },
  template: { select: { name: true } },
  tasks: { orderBy: { createdAt: "asc" as const }, include: { taskDef: true } },
  forms: { include: { signatures: { select: { id: true, signedAt: true } } } },
};

export const onboardingRouter: Router = Router();
onboardingRouter.use(requireAuth);
const canManage = requirePermission(PERMISSIONS.ONBOARDING_MANAGE, PERMISSIONS.ONBOARDING_CREATE);

// list active instances (HR view)
onboardingRouter.get(
  "/instances",
  requirePermission(PERMISSIONS.ONBOARDING_READ),
  asyncHandler(async (_req: Request, res: Response) =>
    void ok(res, await prisma.onboardingInstance.findMany({ orderBy: { startedAt: "desc" }, take: 50, include: INSTANCE_INCLUDE }))
  )
);

// my onboarding (ESS)
onboardingRouter.get(
  "/me",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.employeeId) throw new ForbiddenError("No employee profile linked");
    ok(res, await prisma.onboardingInstance.findFirst({
      where: { employeeId: req.user.employeeId, completedAt: null },
      include: INSTANCE_INCLUDE,
    }));
  })
);

// start an instance from the default (or given) template
onboardingRouter.post(
  "/instances",
  canManage,
  validate({ body: StartSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { employeeId, templateId } = req.body as z.infer<typeof StartSchema>;
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, firstName: true, userId: true, dateOfJoining: true } });
    if (!employee) throw new NotFoundError("Employee");
    const template = templateId
      ? await prisma.onboardingTemplate.findUnique({ where: { id: templateId }, include: { tasks: true } })
      : await prisma.onboardingTemplate.findFirst({ where: { isDefault: true }, include: { tasks: true } });
    if (!template) throw new BadRequestError("No onboarding template — run the seed");

    const open = await prisma.onboardingInstance.findFirst({ where: { employeeId, completedAt: null } });
    if (open) throw new BadRequestError("This employee already has an active onboarding");

    const base = employee.dateOfJoining && employee.dateOfJoining > new Date() ? employee.dateOfJoining : new Date();
    const instance = await prisma.onboardingInstance.create({
      data: {
        employeeId,
        templateId: template.id,
        tasks: {
          create: template.tasks.map((task) => ({
            taskDefId: task.id,
            dueAt: new Date(base.getTime() + task.dueInDays * 86400000),
          })),
        },
        forms: {
          create: [{
            name: "Joining & Policy Acceptance",
            schema: {
              fields: [
                { key: "acceptedHandbook", label: "I have read and accept the Employee Handbook", type: "checkbox", required: true },
                { key: "acceptedCodeOfConduct", label: "I accept the Code of Conduct & confidentiality terms", type: "checkbox", required: true },
                { key: "remarks", label: "Anything HR should know?", type: "text", required: false },
              ],
            },
          }],
        },
      },
      include: INSTANCE_INCLUDE,
    });
    if (employee.userId) {
      await notify({ userId: employee.userId, type: "INFO", title: "Welcome aboard! Your onboarding has started", body: "Complete your checklist, profile and document uploads.", link: "/onboarding" });
    }
    audit({ action: "onboarding.start", entity: "OnboardingInstance", entityId: instance.id, req });
    created(res, instance, "Onboarding started.");
  })
);

// complete / skip a task (assignee roles or the employee themself)
onboardingRouter.patch(
  "/tasks/:id",
  validate({ body: TaskActionSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { action, remarks } = req.body as z.infer<typeof TaskActionSchema>;
    const task = await prisma.onboardingTask.findUnique({
      where: { id: req.params["id"] as string },
      include: { instance: { select: { id: true, employeeId: true } }, taskDef: true },
    });
    if (!task) throw new NotFoundError("Task");
    const isOwn = task.instance.employeeId === req.user?.employeeId;
    const isHr = req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE"].includes(r));
    if (!isOwn && !isHr) throw new ForbiddenError("Not your onboarding task");
    if (action === "skip" && task.taskDef.isMandatory && !isHr) throw new BadRequestError("Mandatory tasks can only be skipped by HR");

    const updated = await prisma.onboardingTask.update({
      where: { id: task.id },
      data: {
        status: action === "complete" ? "COMPLETED" : "SKIPPED",
        completedAt: new Date(),
        assigneeId: req.user!.id,
        remarks: remarks ?? null,
      },
    });

    // auto-complete the instance when nothing is pending
    const pending = await prisma.onboardingTask.count({
      where: { instanceId: task.instance.id, status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } },
    });
    if (pending === 0) {
      await prisma.onboardingInstance.update({ where: { id: task.instance.id }, data: { completedAt: new Date() } });
    }
    audit({ action: `onboarding.task_${action}`, entity: "OnboardingTask", entityId: task.id, req });
    ok(res, updated);
  })
);

// submit + e-sign the joining form (employee only)
onboardingRouter.post(
  "/forms/:id/sign",
  validate({ body: SignSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { typedName } = req.body as z.infer<typeof SignSchema>;
    const form = await prisma.digitalForm.findUnique({
      where: { id: req.params["id"] as string },
      include: { instance: { select: { employeeId: true } }, signatures: true },
    });
    if (!form) throw new NotFoundError("Form");
    if (form.instance.employeeId !== req.user?.employeeId) throw new ForbiddenError("Only the joining employee can sign this form");
    if (form.signatures.length) throw new BadRequestError("Form is already signed");

    const data = (req.body as Record<string, unknown>)["data"] ?? { acceptedHandbook: true, acceptedCodeOfConduct: true };
    const documentHash = crypto.createHash("sha256").update(JSON.stringify({ formId: form.id, data, typedName })).digest("hex");

    await prisma.$transaction([
      prisma.digitalForm.update({ where: { id: form.id }, data: { data: data as never, submittedAt: new Date() } }),
      prisma.eSignature.create({
        data: { formId: form.id, signerId: req.user.id, signatureData: typedName, ip: req.ip ?? null, documentHash },
      }),
    ]);
    audit({ action: "onboarding.form_signed", entity: "DigitalForm", entityId: form.id, after: { documentHash }, req });
    ok(res, { signed: true, documentHash }, "Form signed and recorded.");
  })
);
