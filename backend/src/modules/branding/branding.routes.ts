import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { brandingService, type AssetType } from "./branding.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok } from "../../core/http.js";
import { BadRequestError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { upload, fileUrl, storeUpload } from "../files/files.routes.js";
import { mailService, PREVIEW_LABELS, type PreviewKey } from "../notifications/mail.service.js";

const UpdateBrandingSchema = z.object({
  tagline: z.string().max(120).optional(),
  signatory: z.object({ name: z.string().max(120), title: z.string().max(120) }).partial().optional(),
  footer: z.object({ website: z.string().max(200), email: z.string().max(200), phone: z.string().max(60) }).partial().optional(),
  watermark: z.enum(["", "CONFIDENTIAL", "OFFICIAL DOCUMENT", "EMPLOYEE COPY"]).optional(),
  email: z
    .object({
      logoUrl: z.string().max(500),
      headerColor: z.string().max(20),
      footerText: z.string().max(300),
      website: z.string().max(200),
    })
    .partial()
    .optional(),
});

const PREVIEW_KEYS = ["welcome", "password-reset", "payslip", "announcement"] as const;

const ASSET_TYPES: AssetType[] = ["logo", "letterhead", "stamp", "signatureHr", "signatureCeo", "signatureDirector"];

export const brandingRouter: Router = Router();
brandingRouter.use(requireAuth);

// readable by any authenticated user (drives document previews)
brandingRouter.get("/", asyncHandler(async (_req: Request, res: Response) => void ok(res, await brandingService.get())));

brandingRouter.put(
  "/",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate({ body: UpdateBrandingSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await brandingService.update(req.body, req.user!.id);
    audit({ action: "branding.update", entity: "AppSetting", entityId: "branding", req });
    ok(res, result, "Branding saved.");
  })
);

brandingRouter.post(
  "/asset",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    const type = req.body?.type as AssetType;
    if (!ASSET_TYPES.includes(type)) throw new BadRequestError(`Invalid asset type. One of: ${ASSET_TYPES.join(", ")}`);
    if (!req.file) throw new BadRequestError("No file provided (field 'file')");
    if (!req.file.mimetype.startsWith("image/")) throw new BadRequestError("Branding assets must be images (PNG/JPG)");
    const result = await brandingService.setAsset(type, fileUrl(await storeUpload(req.file)), req.user!.id);
    audit({ action: "branding.asset_upload", entity: "AppSetting", entityId: "branding", after: { type }, req });
    ok(res, result, "Asset uploaded.");
  })
);

// ── email templates: preview + send-test (Settings → Email Templates) ─────────
brandingRouter.get(
  "/email/preview",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate({ query: z.object({ key: z.enum(PREVIEW_KEYS) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const key = req.query["key"] as PreviewKey;
    ok(res, { key, label: PREVIEW_LABELS[key], html: await mailService.previewHtml(key) });
  })
);

brandingRouter.post(
  "/email/test",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate({ body: z.object({ key: z.enum(PREVIEW_KEYS), to: z.string().email() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { key, to } = req.body as { key: PreviewKey; to: string };
    await mailService.sendTest(key, to);
    audit({ action: "branding.email_test", entity: "AppSetting", entityId: "branding", after: { key, to }, req });
    ok(res, { sent: true, to }, `Test ${PREVIEW_LABELS[key]} sent to ${to}.`);
  })
);
