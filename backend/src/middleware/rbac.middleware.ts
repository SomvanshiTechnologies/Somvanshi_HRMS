import type { RequestHandler } from "express";
import { prisma } from "../config/db.js";
import { getRedis } from "../config/redis.js";
import { ForbiddenError, UnauthorizedError } from "../core/errors.js";
import type { PermissionCode } from "../shared/permissions.js";

const CACHE_TTL_SECONDS = 300;
const memoryCache = new Map<string, { perms: Set<string>; expiresAt: number }>();

/**
 * Resolve a user's effective permission set: union of all assigned roles'
 * permissions. Cached in Redis (or in-process memory when Redis is disabled);
 * invalidated whenever roles or role-permission mappings change.
 */
export async function resolvePermissions(userId: string): Promise<Set<string>> {
  const cacheKey = `rbac:perms:${userId}`;
  const redis = getRedis();

  if (redis) {
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return new Set(JSON.parse(cached) as string[]);
  } else {
    const hit = memoryCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.perms;
  }

  const rows = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: { permissions: { select: { permission: { select: { code: true } } } } },
      },
    },
  });
  const perms = new Set<string>(
    rows.flatMap((r) => r.role.permissions.map((p) => p.permission.code))
  );

  if (redis) {
    await redis
      .set(cacheKey, JSON.stringify([...perms]), "EX", CACHE_TTL_SECONDS)
      .catch(() => undefined);
  } else {
    memoryCache.set(cacheKey, { perms, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 });
  }
  return perms;
}

export async function invalidatePermissionCache(userId?: string): Promise<void> {
  const redis = getRedis();
  if (userId) {
    memoryCache.delete(`rbac:perms:${userId}`);
    if (redis) await redis.del(`rbac:perms:${userId}`).catch(() => undefined);
    return;
  }
  memoryCache.clear();
  if (redis) {
    const keys = await redis.keys("rbac:perms:*").catch(() => []);
    if (keys.length) await redis.del(...keys).catch(() => undefined);
  }
}

/** Route guard: requires ANY of the given permission codes. */
export function requirePermission(...codes: PermissionCode[]): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const perms = await resolvePermissions(req.user.id);
      if (!codes.some((c) => perms.has(c))) throw new ForbiddenError();
      next();
    } catch (err) {
      next(err);
    }
  };
}
