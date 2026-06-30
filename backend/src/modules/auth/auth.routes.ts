import { Router } from "express";
import { authController } from "./auth.controller.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth, requireLiveSession } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { authLimiter } from "../../middleware/rateLimit.middleware.js";
import {
  ChangePasswordSchema,
  ForgotPasswordSchema,
  ImpersonateSchema,
  LoginSchema,
  ResetPasswordSchema,
  TwoFactorLoginSchema,
  TwoFactorVerifySchema,
} from "./auth.schema.js";

export const authRouter: Router = Router();

// public (rate-limited)
authRouter.post("/login", authLimiter, validate({ body: LoginSchema }), asyncHandler(authController.login));
authRouter.post("/login/2fa", authLimiter, validate({ body: TwoFactorLoginSchema }), asyncHandler(authController.loginTwoFactor));
authRouter.post("/refresh", authLimiter, asyncHandler(authController.refresh));
authRouter.post("/forgot-password", authLimiter, validate({ body: ForgotPasswordSchema }), asyncHandler(authController.forgotPassword));
authRouter.post("/reset-password", authLimiter, validate({ body: ResetPasswordSchema }), asyncHandler(authController.resetPassword));

// authenticated
authRouter.post("/logout", requireAuth, asyncHandler(authController.logout));
authRouter.get("/me", requireAuth, asyncHandler(authController.me));

// admin/service-account token-exchange: mint a short-lived token scoped to an
// employee, so the caller can act on their behalf via the existing /me routes
authRouter.post(
  "/impersonate",
  requireAuth,
  requireLiveSession,
  requirePermission(PERMISSIONS.AUTH_IMPERSONATE),
  validate({ body: ImpersonateSchema }),
  asyncHandler(authController.impersonate)
);
authRouter.post("/change-password", requireAuth, requireLiveSession, validate({ body: ChangePasswordSchema }), asyncHandler(authController.changePassword));

authRouter.post("/2fa/setup", requireAuth, requireLiveSession, asyncHandler(authController.setupTwoFactor));
authRouter.post("/2fa/verify", requireAuth, requireLiveSession, validate({ body: TwoFactorVerifySchema }), asyncHandler(authController.verifyTwoFactor));
authRouter.delete("/2fa", requireAuth, requireLiveSession, validate({ body: TwoFactorVerifySchema }), asyncHandler(authController.disableTwoFactor));

authRouter.get("/sessions", requireAuth, asyncHandler(authController.sessions));
authRouter.delete("/sessions/:id", requireAuth, asyncHandler(authController.revokeSession));
authRouter.get("/devices", requireAuth, asyncHandler(authController.devices));
