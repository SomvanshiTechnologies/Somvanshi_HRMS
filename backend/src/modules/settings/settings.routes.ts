// App Settings — org-wide key/value configuration (default reporting manager,
// default location, probation period, etc.).
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok } from "../../core/http.js";
import { audit } from "../audit/audit.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

/** Known settings + their value validators. Unknown keys are rejected. */
const SETTINGS = {
  defaultManagerId: z.string().nullable(),
  defaultLocationId: z.string().nullable(),
  probationMonths: z.number().int().min(0).max(24),
  weekStartsOn: z.enum(["SUNDAY", "MONDAY"]),
  workingDaysPerWeek: z.number().int().min(1).max(7),
  emailNotifications: z.boolean(),
} as const;

const DEFAULTS: Record<keyof typeof SETTINGS, unknown> = {
  defaultManagerId: null,
  defaultLocationId: null,
  probationMonths: 6,
  weekStartsOn: "MONDAY",
  workingDaysPerWeek: 5,
  emailNotifications: true,
};

const UpdateSchema = z.object(
  Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof SETTINGS]: z.ZodOptional<(typeof SETTINGS)[K]> }
);

export const settingsRouter: Router = Router();
settingsRouter.use(requireAuth);

// readable by any authenticated user (org defaults, not sensitive)
settingsRouter.get("/", asyncHandler(async (_req: Request, res: Response) => {
  const rows = await prisma.appSetting.findMany();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  ok(res, { ...DEFAULTS, ...stored });
}));

settingsRouter.put("/", requirePermission(PERMISSIONS.SETTINGS_MANAGE), validate({ body: UpdateSchema }), asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const entries = Object.entries(body).filter(([k]) => k in SETTINGS);
  await prisma.$transaction(entries.map(([key, value]) =>
    prisma.appSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, updatedBy: req.user!.id },
      update: { value: value as Prisma.InputJsonValue, updatedBy: req.user!.id },
    })
  ));
  audit({ action: "settings.update", entity: "AppSetting", after: Object.fromEntries(entries), req });
  const rows = await prisma.appSetting.findMany();
  ok(res, { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) }, "Settings saved.");
}));
