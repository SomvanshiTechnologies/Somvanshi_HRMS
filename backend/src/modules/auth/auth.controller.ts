import type { Request, Response } from "express";
import { authService } from "./auth.service.js";
import { ok, noContent } from "../../core/http.js";
import { env, isProd } from "../../config/env.js";
import { UnauthorizedError } from "../../core/errors.js";
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  ImpersonateInput,
  LoginInput,
  ResetPasswordInput,
  TwoFactorLoginInput,
} from "./auth.schema.js";

const REFRESH_COOKIE = "somhr_refresh";

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: `${env.API_PREFIX}/auth`,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clientCtx(req: Request, body?: Partial<LoginInput>) {
  return {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    deviceFingerprint: body?.deviceFingerprint,
    deviceName: body?.deviceName,
  };
}

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const body = req.body as LoginInput;
    const result = await authService.login(body.email, body.password, clientCtx(req, body), req);
    if (result.requiresTwoFactor) {
      ok(res, { requiresTwoFactor: true, challengeToken: result.challengeToken });
      return;
    }
    setRefreshCookie(res, result.tokens!.refreshToken);
    ok(res, { requiresTwoFactor: false, accessToken: result.tokens!.accessToken, user: result.user });
  },

  async loginTwoFactor(req: Request, res: Response): Promise<void> {
    const body = req.body as TwoFactorLoginInput;
    const result = await authService.loginWithTwoFactor(body.challengeToken, body.code, clientCtx(req), req);
    setRefreshCookie(res, result.tokens!.refreshToken);
    ok(res, { accessToken: result.tokens!.accessToken, user: result.user });
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const presented =
      (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ??
      (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    if (!presented) throw new UnauthorizedError("Missing refresh token", "REFRESH_MISSING");
    const tokens = await authService.refresh(presented, clientCtx(req));
    setRefreshCookie(res, tokens.refreshToken);
    ok(res, { accessToken: tokens.accessToken });
  },

  async logout(req: Request, res: Response): Promise<void> {
    if (req.user) await authService.logout(req.user.id, req.user.sessionId, req);
    res.clearCookie(REFRESH_COOKIE, { path: `${env.API_PREFIX}/auth` });
    noContent(res);
  },

  async me(req: Request, res: Response): Promise<void> {
    ok(res, await authService.me(req.user!.id));
  },

  async impersonate(req: Request, res: Response): Promise<void> {
    const { employeeId } = req.body as ImpersonateInput;
    const caller = req.user!;
    const result = await authService.impersonate(
      { userId: caller.id, sessionId: caller.sessionId, roles: caller.roles },
      employeeId,
      req
    );
    ok(res, result);
  },

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const body = req.body as ForgotPasswordInput;
    await authService.forgotPassword(body.email);
    ok(res, null, "If that email exists, a reset link has been sent.");
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    const body = req.body as ResetPasswordInput;
    await authService.resetPassword(body.token, body.password, req);
    ok(res, null, "Password updated. Please sign in.");
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    const body = req.body as ChangePasswordInput;
    await authService.changePassword(req.user!.id, body.currentPassword, body.newPassword, req);
    ok(res, null, "Password changed.");
  },

  async setupTwoFactor(req: Request, res: Response): Promise<void> {
    ok(res, await authService.setupTwoFactor(req.user!.id));
  },

  async verifyTwoFactor(req: Request, res: Response): Promise<void> {
    const { code } = req.body as { code: string };
    ok(res, await authService.verifyTwoFactor(req.user!.id, code, req), "Two-factor authentication enabled.");
  },

  async disableTwoFactor(req: Request, res: Response): Promise<void> {
    const { code } = req.body as { code: string };
    await authService.disableTwoFactor(req.user!.id, code, req);
    ok(res, null, "Two-factor authentication disabled.");
  },

  async sessions(req: Request, res: Response): Promise<void> {
    ok(res, await authService.listSessions(req.user!.id));
  },

  async revokeSession(req: Request, res: Response): Promise<void> {
    await authService.revokeSession(req.user!.id, req.params["id"] as string, req);
    noContent(res);
  },

  async devices(req: Request, res: Response): Promise<void> {
    ok(res, await authService.listDevices(req.user!.id));
  },
};
