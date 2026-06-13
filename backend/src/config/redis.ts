import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "../core/logger.js";

/**
 * Redis is required in production (rate limiting, RBAC cache, queues, socket
 * presence). In development it can be disabled (REDIS_ENABLED=false) and all
 * consumers must degrade gracefully via `getRedis()` returning null.
 */
let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (!env.REDIS_ENABLED) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 500, 5_000),
    });
    client.on("connect", () => logger.info("✅ Redis connected"));
    client.on("error", (err) => logger.warn({ err: err.message }, "Redis error"));
  }
  return client;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    logger.warn("Redis disabled (REDIS_ENABLED=false) — caches and rate limits fall back to memory");
    return;
  }
  await redis.connect();
}
