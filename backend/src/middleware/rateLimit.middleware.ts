import { rateLimit, type RateLimitRequestHandler } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "../config/redis.js";

/**
 * Sliding-window rate limiting. Uses Redis when available (multi-instance
 * safe); falls back to in-memory per process in development.
 */
function buildLimiter(windowMs: number, limit: number, prefix: string): RateLimitRequestHandler {
  const redis = getRedis();
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
    },
    ...(redis
      ? {
          store: new RedisStore({
            sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as never,
            prefix: `rl:${prefix}:`,
          }),
        }
      : {}),
  });
}

/** Hard limit for credential endpoints (login, forgot/reset password, 2FA). */
export const authLimiter = buildLimiter(15 * 60 * 1000, 20, "auth");

/** General API limit per IP. */
export const apiLimiter = buildLimiter(60 * 1000, 300, "api");

/** Expensive endpoints (exports, AI, payroll runs). */
export const heavyLimiter = buildLimiter(60 * 1000, 20, "heavy");
