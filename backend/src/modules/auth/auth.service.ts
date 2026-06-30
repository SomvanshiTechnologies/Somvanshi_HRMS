import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "../../core/errors.js";
import { tokenService } from "./token.service.js";
import { resolvePermissions } from "../../middleware/rbac.middleware.js";
import { audit } from "../audit/audit.service.js";
import { mailService } from "../notifications/mail.service.js";
import type { Request } from "express";
import crypto from "node:crypto";

interface ClientContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
  deviceFingerprint?: string | undefined;
  deviceName?: string | undefined;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult {
  requiresTwoFactor: boolean;
  challengeToken?: string;
  tokens?: AuthTokens;
  user?: Awaited<ReturnType<typeof buildMe>>;
}

async function buildMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      status: true,
      twoFactorEnabled: true,
      mustChangePassword: true,
      lastLoginAt: true,
      roles: { select: { role: { select: { name: true, displayName: true } } } },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          displayName: true,
          photoUrl: true,
          status: true,
          designation: { select: { title: true } },
          department: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!user) throw new NotFoundError("User");
  const permissions = [...(await resolvePermissions(userId))];
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    twoFactorEnabled: user.twoFactorEnabled,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    roles: user.roles.map((r) => ({ name: r.role.name, displayName: r.role.displayName })),
    employee: user.employee,
    permissions, // drives the permission-aware frontend (menus, buttons, pages)
  };
}

async function issueSession(userId: string, employeeId: string | null, roles: string[], ctx: ClientContext): Promise<AuthTokens> {
  // device tracking
  let deviceId: string | null = null;
  if (ctx.deviceFingerprint) {
    const device = await prisma.device.upsert({
      where: { userId_fingerprint: { userId, fingerprint: ctx.deviceFingerprint } },
      create: {
        userId,
        fingerprint: ctx.deviceFingerprint,
        name: ctx.deviceName ?? null,
        platform: ctx.userAgent?.slice(0, 120) ?? null,
        lastSeenAt: new Date(),
      },
      update: { lastSeenAt: new Date(), ...(ctx.deviceName ? { name: ctx.deviceName } : {}) },
    });
    deviceId = device.id;
  }

  const session = await prisma.session.create({
    data: {
      userId,
      deviceId,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      expiresAt: tokenService.refreshExpiry(),
    },
  });

  const family = crypto.randomUUID();
  const refreshToken = tokenService.signRefreshToken({ sub: userId, sessionId: session.id, family });
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: tokenService.hashToken(refreshToken),
      family,
      expiresAt: tokenService.refreshExpiry(),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });

  const accessToken = tokenService.signAccessToken({
    sub: userId,
    employeeId,
    roles,
    sessionId: session.id,
  });

  return { accessToken, refreshToken };
}

export const authService = {
  async login(email: string, password: string, ctx: ClientContext, req?: Request): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } }, employee: { select: { id: true } } },
    });

    // identical error for unknown email and bad password — no user enumeration
    const invalid = new UnauthorizedError("Invalid email or password", "INVALID_CREDENTIALS");
    if (!user || user.deletedAt) throw invalid;

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedError(
        "Account temporarily locked due to repeated failed logins. Try again later.",
        "ACCOUNT_LOCKED"
      );
    }
    if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") {
      throw new UnauthorizedError("Account is not active. Contact HR.", "ACCOUNT_INACTIVE");
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= env.ACCOUNT_LOCK_THRESHOLD;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lock ? 0 : attempts,
          ...(lock
            ? { lockedUntil: new Date(Date.now() + env.ACCOUNT_LOCK_MINUTES * 60_000), status: "LOCKED" }
            : {}),
        },
      });
      if (lock) audit({ userId: user.id, action: "auth.account_locked", entity: "User", entityId: user.id, req });
      throw invalid;
    }

    // success — reset counters
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), status: user.status === "LOCKED" ? "ACTIVE" : user.status },
    });

    if (user.twoFactorEnabled) {
      // short-lived challenge token; client must complete TOTP step
      const challengeToken = jwt.sign(
        { sub: user.id, type: "2fa-challenge", ctx: { fp: ctx.deviceFingerprint ?? null } },
        env.JWT_ACCESS_SECRET,
        { expiresIn: "5m" }
      );
      return { requiresTwoFactor: true, challengeToken };
    }

    const roles = user.roles.map((r) => r.role.name);
    const tokens = await issueSession(user.id, user.employee?.id ?? null, roles, ctx);
    audit({ userId: user.id, action: "auth.login", entity: "User", entityId: user.id, req });
    return { requiresTwoFactor: false, tokens, user: await buildMe(user.id) };
  },

  async loginWithTwoFactor(challengeToken: string, code: string, ctx: ClientContext, req?: Request): Promise<LoginResult> {
    let payload: { sub: string; type: string };
    try {
      payload = jwt.verify(challengeToken, env.JWT_ACCESS_SECRET) as { sub: string; type: string };
      if (payload.type !== "2fa-challenge") throw new Error("wrong type");
    } catch {
      throw new UnauthorizedError("2FA challenge expired — log in again", "CHALLENGE_EXPIRED");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: { include: { role: true } },
        employee: { select: { id: true } },
        twoFactorSecret: true,
      },
    });
    if (!user?.twoFactorSecret) throw new UnauthorizedError("2FA not configured", "2FA_NOT_SETUP");

    let valid = authenticator.verify({ token: code, secret: user.twoFactorSecret.secret });

    if (!valid) {
      // recovery code path (single-use)
      const codes = (user.twoFactorSecret.recoveryCodes as string[]) ?? [];
      const hash = tokenService.hashToken(code.toLowerCase());
      if (codes.includes(hash)) {
        valid = true;
        await prisma.twoFactorSecret.update({
          where: { userId: user.id },
          data: { recoveryCodes: codes.filter((c) => c !== hash) },
        });
      }
    }
    if (!valid) throw new UnauthorizedError("Invalid verification code", "2FA_INVALID");

    const roles = user.roles.map((r) => r.role.name);
    const tokens = await issueSession(user.id, user.employee?.id ?? null, roles, ctx);
    audit({ userId: user.id, action: "auth.login_2fa", entity: "User", entityId: user.id, req });
    return { requiresTwoFactor: false, tokens, user: await buildMe(user.id) };
  },

  /**
   * Rotating refresh: every use revokes the presented token and issues a new
   * one in the same family. Reuse of a revoked token = theft signal → the
   * whole family and session are revoked.
   */
  async refresh(presented: string, ctx: ClientContext): Promise<AuthTokens> {
    const payload = tokenService.verifyRefreshToken(presented);
    const hash = tokenService.hashToken(presented);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedError("Refresh token expired", "REFRESH_INVALID");
    }
    if (stored.revokedAt) {
      // Grace window: multiple tabs can fire a refresh at the same instant with
      // the same cookie. If this token was rotated very recently (benign race),
      // issue a fresh token in the same family instead of treating it as theft.
      const GRACE_MS = 30_000;
      const benign = stored.replacedBy && Date.now() - stored.revokedAt.getTime() < GRACE_MS;
      if (!benign) {
        await prisma.refreshToken.updateMany({
          where: { family: stored.family, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await prisma.session.update({
          where: { id: payload.sessionId },
          data: { revokedAt: new Date() },
        }).catch(() => undefined);
        audit({ userId: stored.userId, action: "auth.refresh_reuse_detected", entity: "RefreshToken", entityId: stored.id });
        throw new UnauthorizedError("Token reuse detected — all sessions revoked", "REFRESH_REUSED");
      }
    }

    const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedError("Session expired", "SESSION_INVALID");
    }

    const user = await prisma.user.findUnique({
      where: { id: stored.userId },
      include: { roles: { include: { role: true } }, employee: { select: { id: true } } },
    });
    if (!user || ["SUSPENDED", "DEACTIVATED", "LOCKED"].includes(user.status)) {
      throw new UnauthorizedError("Account is not active", "ACCOUNT_INACTIVE");
    }

    const newRefresh = tokenService.signRefreshToken({
      sub: user.id,
      sessionId: session.id,
      family: stored.family,
    });
    const newHash = tokenService.hashToken(newRefresh);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedBy: newHash },
      }),
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          family: stored.family,
          expiresAt: tokenService.refreshExpiry(),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        },
      }),
      prisma.session.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } }),
    ]);

    const accessToken = tokenService.signAccessToken({
      sub: user.id,
      employeeId: user.employee?.id ?? null,
      roles: user.roles.map((r) => r.role.name),
      sessionId: session.id,
    });
    return { accessToken, refreshToken: newRefresh };
  },

  /**
   * Admin impersonation / token-exchange. A caller holding `auth:impersonate`
   * mints a short-lived access token scoped to a target employee, so a service
   * account (e.g. the self-service chatbot) can read and act on that employee's
   * behalf through the existing `/me` routes — with correct attribution.
   *
   * Scoping is least-privilege and fully DB-driven:
   *  - `sub`/`roles` resolve to the TARGET employee's own login when they have an
   *    active one, so the token can only do what that employee could do and the
   *    audit actor is the employee themselves;
   *  - if the employee has no usable login, it falls back to the privileged
   *    caller so the bot can still act, while `employeeId` still points at the
   *    target so every `/me` query and write is filed under them.
   * The token always carries `impersonatedBy` (the caller) for traceability.
   */
  async impersonate(
    caller: { userId: string; sessionId: string; roles: string[] },
    employeeId: string,
    req?: Request
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    actingFor: { employeeId: string; employeeCode: string; name: string };
  }> {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        displayName: true,
        user: {
          select: {
            id: true,
            status: true,
            roles: { select: { role: { select: { name: true } } } },
          },
        },
      },
    });
    if (!employee) throw new NotFoundError("Employee");

    const login = employee.user;
    const usableLogin =
      login && !["SUSPENDED", "DEACTIVATED", "LOCKED"].includes(login.status) ? login : null;

    const sub = usableLogin?.id ?? caller.userId;
    const roles = usableLogin ? usableLogin.roles.map((r) => r.role.name) : caller.roles;

    const accessToken = tokenService.signAccessToken(
      {
        sub,
        employeeId: employee.id,
        roles,
        sessionId: caller.sessionId,
        impersonatedBy: caller.userId,
      },
      env.IMPERSONATION_TTL_SECONDS
    );

    audit({
      userId: caller.userId,
      action: "auth.impersonate",
      entity: "Employee",
      entityId: employee.id,
      after: { actingForUserId: sub, employeeCode: employee.employeeCode },
      req,
    });

    const name = (employee.displayName ?? `${employee.firstName} ${employee.lastName}`).trim();
    return {
      accessToken,
      expiresIn: env.IMPERSONATION_TTL_SECONDS,
      actingFor: { employeeId: employee.id, employeeCode: employee.employeeCode, name },
    };
  },

  async logout(userId: string, sessionId: string, req?: Request): Promise<void> {
    await prisma.$transaction([
      prisma.session.updateMany({ where: { id: sessionId, userId }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    audit({ userId, action: "auth.logout", entity: "Session", entityId: sessionId, req });
  },

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    // always succeed silently — no user enumeration
    if (!user || user.deletedAt) return;

    const raw = tokenService.randomToken(32);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenService.hashToken(raw),
        expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000),
      },
    });
    await mailService.sendPasswordReset(user.email, raw);
  },

  async resetPassword(token: string, password: string, req?: Request): Promise<void> {
    const hash = tokenService.hashToken(token);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestError("Reset link is invalid or has expired");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      // force re-login everywhere
      prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    audit({ userId: record.userId, action: "auth.password_reset", entity: "User", entityId: record.userId, req });
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string, req?: Request): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User");
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) throw new UnauthorizedError("Current password is incorrect", "INVALID_CREDENTIALS");
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false },
    });
    audit({ userId, action: "auth.password_change", entity: "User", entityId: userId, req });
  },

  // ---- 2FA lifecycle ----

  async setupTwoFactor(userId: string): Promise<{ otpauthUrl: string; secret: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User");
    const secret = authenticator.generateSecret();
    await prisma.twoFactorSecret.upsert({
      where: { userId },
      create: { userId, secret, recoveryCodes: [] },
      update: { secret, verifiedAt: null, recoveryCodes: [] },
    });
    return {
      otpauthUrl: authenticator.keyuri(user.email, env.TWO_FACTOR_ISSUER, secret),
      secret,
    };
  },

  async verifyTwoFactor(userId: string, code: string, req?: Request): Promise<{ recoveryCodes: string[] }> {
    const tfs = await prisma.twoFactorSecret.findUnique({ where: { userId } });
    if (!tfs) throw new BadRequestError("Run 2FA setup first");
    if (!authenticator.verify({ token: code, secret: tfs.secret })) {
      throw new BadRequestError("Invalid verification code");
    }
    const rawCodes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString("hex"));
    await prisma.$transaction([
      prisma.twoFactorSecret.update({
        where: { userId },
        data: { verifiedAt: new Date(), recoveryCodes: rawCodes.map((c) => tokenService.hashToken(c)) },
      }),
      prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } }),
    ]);
    audit({ userId, action: "auth.2fa_enabled", entity: "User", entityId: userId, req });
    return { recoveryCodes: rawCodes }; // shown exactly once
  },

  async disableTwoFactor(userId: string, code: string, req?: Request): Promise<void> {
    const tfs = await prisma.twoFactorSecret.findUnique({ where: { userId } });
    if (!tfs) throw new BadRequestError("2FA is not enabled");
    if (!authenticator.verify({ token: code, secret: tfs.secret })) {
      throw new BadRequestError("Invalid verification code");
    }
    await prisma.$transaction([
      prisma.twoFactorSecret.delete({ where: { userId } }),
      prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } }),
    ]);
    audit({ userId, action: "auth.2fa_disabled", entity: "User", entityId: userId, req });
  },

  // ---- sessions & devices ----

  async listSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: "desc" },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        lastActiveAt: true,
        createdAt: true,
        device: { select: { id: true, name: true, platform: true, isTrusted: true } },
      },
    });
  },

  async revokeSession(userId: string, sessionId: string, req?: Request): Promise<void> {
    const session = await prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundError("Session");
    await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    audit({ userId, action: "auth.session_revoked", entity: "Session", entityId: sessionId, req });
  },

  async listDevices(userId: string) {
    return prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, name: true, platform: true, browser: true, isTrusted: true, lastSeenAt: true, createdAt: true },
    });
  },

  me: buildMe,
};
