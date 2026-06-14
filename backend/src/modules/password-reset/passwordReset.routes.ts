import { Router } from "express";
import type { Request, Response } from "express";
import { passwordResetService } from "./passwordReset.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created } from "../../core/http.js";
import { RequestResetSchema, ReviewResetSchema, type RequestResetInput, type ReviewResetInput } from "./passwordReset.schema.js";

export const passwordResetRouter: Router = Router();
passwordResetRouter.use(requireAuth);

// ---- employee self-service ----
passwordResetRouter.post(
  "/requests",
  validate({ body: RequestResetSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void created(res, await passwordResetService.requestReset(req.user!.id, (req.body as RequestResetInput).reason, req), "Reset request submitted to admin.")
  )
);

passwordResetRouter.get(
  "/requests/mine",
  asyncHandler(async (req: Request, res: Response) => void ok(res, await passwordResetService.myRequests(req.user!.id)))
);

// ---- admin queue ----
passwordResetRouter.get(
  "/requests",
  requirePermission(PERMISSIONS.USERS_MANAGE),
  asyncHandler(async (req: Request, res: Response) => {
    const status = (req.query["status"] as "PENDING" | "APPROVED" | "REJECTED" | undefined) ?? "PENDING";
    ok(res, await passwordResetService.listRequests(status));
  })
);

passwordResetRouter.post(
  "/requests/:id/approve",
  requirePermission(PERMISSIONS.USERS_MANAGE),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await passwordResetService.approveRequest(req.params["id"] as string, req.user!.id, req), "Temporary password generated and emailed.")
  )
);

passwordResetRouter.post(
  "/requests/:id/reject",
  requirePermission(PERMISSIONS.USERS_MANAGE),
  validate({ body: ReviewResetSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await passwordResetService.rejectRequest(req.params["id"] as string, req.user!.id, (req.body as ReviewResetInput).remarks, req), "Request declined.")
  )
);
