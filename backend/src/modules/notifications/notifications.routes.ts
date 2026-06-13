import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../../config/db.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { ok, paginated, buildMeta } from "../../core/http.js";
import { validate, getQuery } from "../../middleware/validate.middleware.js";
import { PageQuerySchema, toSkipTake, type PageQuery } from "../../shared/pagination.js";

export const notificationsRouter: Router = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  "/",
  validate({ query: PageQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = getQuery<PageQuery>(res);
    const { skip, take } = toSkipTake(query);
    const where = { userId: req.user!.id };
    const [rows, total, unread] = await prisma.$transaction([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);
    res.setHeader("X-Unread-Count", String(unread));
    paginated(res, rows, buildMeta(query.page, query.limit, total));
  })
);

notificationsRouter.get(
  "/unread-count",
  asyncHandler(async (req: Request, res: Response) => {
    const count = await prisma.notification.count({ where: { userId: req.user!.id, isRead: false } });
    ok(res, { count });
  })
);

notificationsRouter.patch(
  "/:id/read",
  asyncHandler(async (req: Request, res: Response) => {
    await prisma.notification.updateMany({
      where: { id: req.params["id"] as string, userId: req.user!.id },
      data: { isRead: true, readAt: new Date() },
    });
    ok(res, null);
  })
);

notificationsRouter.patch(
  "/read-all",
  asyncHandler(async (req: Request, res: Response) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    ok(res, null);
  })
);
