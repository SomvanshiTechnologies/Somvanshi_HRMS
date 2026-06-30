import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { UnauthorizedError } from "../../core/errors.js";

export interface AccessTokenPayload {
  sub: string; // userId
  employeeId: string | null;
  roles: string[];
  sessionId: string;
  type: "access";
  /** Present only on impersonation tokens: userId of the privileged caller who
   *  minted this token to act on the target employee's behalf. */
  impersonatedBy?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  family: string;
  type: "refresh";
}

const accessOpts: SignOptions = { expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"] };
const refreshOpts: SignOptions = { expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"] };

export const tokenService = {
  signAccessToken(
    payload: Omit<AccessTokenPayload, "type">,
    expiresIn?: SignOptions["expiresIn"]
  ): string {
    const opts: SignOptions = expiresIn !== undefined ? { expiresIn } : accessOpts;
    return jwt.sign({ ...payload, type: "access" }, env.JWT_ACCESS_SECRET, opts);
  },

  signRefreshToken(payload: Omit<RefreshTokenPayload, "type">): string {
    return jwt.sign({ ...payload, type: "refresh" }, env.JWT_REFRESH_SECRET, refreshOpts);
  },

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
      if (decoded.type !== "access") throw new Error("wrong type");
      return decoded;
    } catch {
      throw new UnauthorizedError("Invalid or expired access token", "TOKEN_INVALID");
    }
  },

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
      if (decoded.type !== "refresh") throw new Error("wrong type");
      return decoded;
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token", "REFRESH_INVALID");
    }
  },

  /** Refresh tokens are stored hashed — a DB leak must not leak usable tokens. */
  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  },

  randomToken(bytes = 48): string {
    return crypto.randomBytes(bytes).toString("hex");
  },

  refreshExpiry(): Date {
    const ttl = env.JWT_REFRESH_TTL;
    const days = ttl.endsWith("d") ? parseInt(ttl, 10) : 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  },
};
