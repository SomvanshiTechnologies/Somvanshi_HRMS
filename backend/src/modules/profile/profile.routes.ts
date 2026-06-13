import { Router } from "express";
import type { Request, Response } from "express";
import { profileService } from "./profile.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created, noContent } from "../../core/http.js";
import { BadRequestError } from "../../core/errors.js";
import { upload, fileUrl } from "../files/files.routes.js";
import {
  CreateChangeRequestSchema,
  ProfessionalInfoSchema,
  ReviewChangeRequestSchema,
  UploadDocumentSchema,
  type CreateChangeRequestInput,
} from "./profile.schema.js";

export const profileRouter: Router = Router();
profileRouter.use(requireAuth);

// ---- self-service ----

profileRouter.get("/me", asyncHandler(async (req: Request, res: Response) => void ok(res, await profileService.me(req))));

profileRouter.patch(
  "/me/professional",
  validate({ body: ProfessionalInfoSchema }),
  asyncHandler(async (req: Request, res: Response) => void ok(res, await profileService.updateProfessional(req, req.body), "Professional info updated."))
);

profileRouter.post(
  "/me/photo",
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError("No image provided (field 'file')");
    if (!req.file.mimetype.startsWith("image/")) throw new BadRequestError("Profile photo must be an image");
    ok(res, await profileService.updatePhoto(req, fileUrl(req.file.filename)), "Photo updated.");
  })
);

profileRouter.post(
  "/me/change-requests",
  validate({ body: CreateChangeRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateChangeRequestInput;
    created(
      res,
      await profileService.createChangeRequest(req, body.changes, body.isDraft),
      body.isDraft ? "Draft saved." : "Submitted for HR review."
    );
  })
);

profileRouter.get("/me/change-requests", asyncHandler(async (req: Request, res: Response) => void ok(res, await profileService.myChangeRequests(req))));

profileRouter.post("/me/change-requests/:id/submit", asyncHandler(async (req: Request, res: Response) => void ok(res, await profileService.submitDraft(req, req.params["id"] as string), "Submitted for HR review.")));

profileRouter.delete(
  "/me/change-requests/:id",
  asyncHandler(async (req: Request, res: Response) => {
    await profileService.cancelChangeRequest(req, req.params["id"] as string);
    noContent(res);
  })
);

profileRouter.get("/me/documents", asyncHandler(async (req: Request, res: Response) => void ok(res, await profileService.listDocuments(req))));

profileRouter.post(
  "/me/documents",
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError("No file provided (field 'file')");
    const input = UploadDocumentSchema.parse(req.body);
    created(
      res,
      await profileService.uploadDocument(req, input, {
        url: fileUrl(req.file.filename),
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      }),
      "Document uploaded."
    );
  })
);

// ---- HR review ----

profileRouter.get(
  "/change-requests",
  requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
  asyncHandler(async (req: Request, res: Response) => {
    const status = (req.query["status"] as "PENDING" | "APPROVED" | "REJECTED" | undefined) ?? "PENDING";
    ok(res, await profileService.listPendingRequests(status));
  })
);

profileRouter.patch(
  "/change-requests/:id/approve",
  requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
  validate({ body: ReviewChangeRequestSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await profileService.review(req, req.params["id"] as string, "APPROVED", (req.body as { remarks?: string }).remarks), "Changes approved and applied.")
  )
);

profileRouter.patch(
  "/change-requests/:id/reject",
  requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
  validate({ body: ReviewChangeRequestSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await profileService.review(req, req.params["id"] as string, "REJECTED", (req.body as { remarks?: string }).remarks), "Request rejected.")
  )
);
