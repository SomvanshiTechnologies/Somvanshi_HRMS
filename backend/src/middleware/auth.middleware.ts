import type { NextFunction, Request, RequestHandler, Response } from "express";
import { tokenService, type AccessTokenPayload } from "../modules/auth/token.service.js";
import { UnauthorizedError } from "../core/errors.js";
import { prisma } from "../config/db.js";

export interface AuthUser {
  id: string;
  employeeId: string | null;
  roles: string[];
  sessionId: string;
  /** Set when the caller is acting via an impersonation token: the userId of the
   *  privileged service account that minted it. Undefined for normal sessions. */
  impersonatedBy?: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = (req.cookies as Record<string, string> | undefined)?.["somhr_access"];
  return cookie ?? null;
}

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) return next(new UnauthorizedError());
  const payload: AccessTokenPayload = tokenService.verifyAccessToken(token);
  req.user = {
    id: payload.sub,
    employeeId: payload.employeeId,
    roles: payload.roles,
    sessionId: payload.sessionId,
    ...(payload.impersonatedBy ? { impersonatedBy: payload.impersonatedBy } : {}),
  };
  next();
};

/** Stricter variant for sensitive routes: also verifies the session is alive. */
export const requireLiveSession: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const session = await prisma.session.findUnique({ where: { id: req.user.sessionId } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedError("Session expired or revoked", "SESSION_INVALID");
    }
    next();
  } catch (err) {
    next(err);
  }
};
