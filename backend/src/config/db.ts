import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";
import { logger } from "../core/logger.js";

/**
 * Prisma 7 requires a driver adapter. We use the MariaDB adapter, which is
 * Prisma's official driver for MySQL 8 (local dev) and AWS RDS MySQL (prod).
 */
const adapter = new PrismaMariaDb(env.DATABASE_URL);

/** Single Prisma client instance — the only DB gateway (used exclusively by repositories). */
export const prisma = new PrismaClient({ adapter });

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info("✅ MySQL connected (Prisma)");
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
