import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { logger } from "../../core/logger.js";

export interface AuditEntry {
  userId?: string | null;
  action: string; // e.g. "auth.login", "employee.update"
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  req?: Request;
}

/**
 * Append-only audit trail. Fire-and-forget: an audit failure must never
 * fail the business operation, but it is always logged.
 */
export function audit(entry: AuditEntry): void {
  const { req, ...rest } = entry;
  void prisma.auditLog
    .create({
      data: {
        userId: rest.userId ?? req?.user?.id ?? null,
        action: rest.action,
        entity: rest.entity,
        entityId: rest.entityId ?? null,
        before: rest.before === undefined ? undefined : (rest.before as object),
        after: rest.after === undefined ? undefined : (rest.after as object),
        ip: req?.ip ?? null,
        userAgent: req?.headers["user-agent"] ?? null,
      },
    })
    .catch((err: unknown) => logger.error({ err, action: rest.action }, "audit write failed"));
}
