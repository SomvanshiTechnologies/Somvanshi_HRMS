import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { analyticsService } from "./analytics.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { validate, getQuery } from "../../middleware/validate.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok } from "../../core/http.js";

export const analyticsRouter: Router = Router();
analyticsRouter.use(requireAuth);

const canRead = requirePermission(PERMISSIONS.ANALYTICS_READ, PERMISSIONS.ANALYTICS_READ_ALL);
const MonthsQuery = z.object({ months: z.coerce.number().int().min(3).max(36).default(12) });
type MonthsQueryT = z.infer<typeof MonthsQuery>;

analyticsRouter.get("/overview", canRead, asyncHandler(async (_req: Request, res: Response) => void ok(res, await analyticsService.overview())));

analyticsRouter.get("/headcount-trend", canRead, validate({ query: MonthsQuery }), asyncHandler(async (_req: Request, res: Response) => void ok(res, await analyticsService.headcountTrend(getQuery<MonthsQueryT>(res).months))));

analyticsRouter.get("/hiring-trend", canRead, validate({ query: MonthsQuery }), asyncHandler(async (_req: Request, res: Response) => void ok(res, await analyticsService.hiringTrend(getQuery<MonthsQueryT>(res).months))));

analyticsRouter.get("/payroll-trend", requirePermission(PERMISSIONS.ANALYTICS_READ_ALL, PERMISSIONS.PAYROLL_READ_ALL), validate({ query: MonthsQuery }), asyncHandler(async (_req: Request, res: Response) => void ok(res, await analyticsService.payrollTrend(getQuery<MonthsQueryT>(res).months))));

analyticsRouter.get("/attrition-trend", canRead, validate({ query: MonthsQuery }), asyncHandler(async (_req: Request, res: Response) => void ok(res, await analyticsService.attritionTrend(getQuery<MonthsQueryT>(res).months))));

analyticsRouter.get("/department", canRead, asyncHandler(async (_req: Request, res: Response) => void ok(res, await analyticsService.departmentAnalytics())));

analyticsRouter.get("/leave-trends", canRead, validate({ query: MonthsQuery }), asyncHandler(async (_req: Request, res: Response) => void ok(res, await analyticsService.leaveTrends(getQuery<MonthsQueryT>(res).months))));

analyticsRouter.get("/hiring-funnel", canRead, asyncHandler(async (_req: Request, res: Response) => void ok(res, await analyticsService.hiringFunnel())));

analyticsRouter.get("/attendance-trend", canRead, validate({ query: MonthsQuery }), asyncHandler(async (_req: Request, res: Response) => void ok(res, await analyticsService.attendanceTrend(getQuery<MonthsQueryT>(res).months))));

// celebrations are visible to every authenticated employee (no analytics permission needed)
analyticsRouter.get("/celebrations", asyncHandler(async (_req: Request, res: Response) => void ok(res, await analyticsService.celebrations())));
