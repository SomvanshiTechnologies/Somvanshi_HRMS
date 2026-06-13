import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { paginated, buildMeta } from "../../core/http.js";
import { validate, getQuery } from "../../middleware/validate.middleware.js";
import { PageQuerySchema, toSkipTake } from "../../shared/pagination.js";

const AuditQuerySchema = PageQuerySchema.extend({
  entity: z.string().max(64).optional(),
  userId: z.string().optional(),
  action: z.string().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const auditRouter: Router = Router();
auditRouter.use(requireAuth, requirePermission(PERMISSIONS.AUDIT_READ_ALL));

auditRouter.get(
  "/",
  validate({ query: AuditQuerySchema }),
  asyncHandler(async (_req: Request, res: Response) => {
    const query = getQuery<AuditQuery>(res);
    const { skip, take } = toSkipTake(query);
    const where = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { user: { select: { id: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    paginated(res, rows, buildMeta(query.page, query.limit, total));
  })
);
