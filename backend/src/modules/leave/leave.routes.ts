import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { leaveService } from "./leave.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate, getQuery } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created, noContent } from "../../core/http.js";
import {
  ApplyLeaveSchema,
  BulkApproveSchema,
  CalendarQuerySchema,
  DecideLeaveSchema,
  EditLeaveSchema,
  HolidaySchema,
  RequestInfoSchema,
  WorkflowStepsSchema,
  type CalendarQuery,
} from "./leave.schema.js";

export const leaveRouter: Router = Router();
leaveRouter.use(requireAuth);

// ---- reference data ----
leaveRouter.get("/types", requirePermission(PERMISSIONS.LEAVE_READ), asyncHandler(async (_req: Request, res: Response) => void ok(res, await leaveService.listTypes())));

// ---- employee self-service ----
leaveRouter.get(
  "/balances/me",
  requirePermission(PERMISSIONS.LEAVE_READ),
  validate({ query: z.object({ year: z.coerce.number().int().optional() }) }),
  asyncHandler(async (_req: Request, res: Response) => {
    const { year } = getQuery<{ year?: number }>(res);
    ok(res, await leaveService.myBalances(_req, year));
  })
);

leaveRouter.post(
  "/requests",
  requirePermission(PERMISSIONS.LEAVE_CREATE),
  validate({ body: ApplyLeaveSchema }),
  asyncHandler(async (req: Request, res: Response) => void created(res, await leaveService.apply(req, req.body), "Leave request submitted."))
);

leaveRouter.get(
  "/requests/me",
  requirePermission(PERMISSIONS.LEAVE_READ),
  validate({ query: z.object({ year: z.coerce.number().int().optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { year } = getQuery<{ year?: number }>(res);
    ok(res, await leaveService.myRequests(req, year));
  })
);

leaveRouter.put(
  "/requests/:id",
  requirePermission(PERMISSIONS.LEAVE_CREATE),
  validate({ body: EditLeaveSchema }),
  asyncHandler(async (req: Request, res: Response) => void ok(res, await leaveService.edit(req, req.params["id"] as string, req.body), "Leave request updated."))
);

leaveRouter.delete(
  "/requests/:id",
  requirePermission(PERMISSIONS.LEAVE_CREATE),
  asyncHandler(async (req: Request, res: Response) => {
    await leaveService.cancel(req, req.params["id"] as string);
    noContent(res);
  })
);

// ---- approvals ----
leaveRouter.get(
  "/approvals",
  requirePermission(PERMISSIONS.LEAVE_APPROVE),
  asyncHandler(async (req: Request, res: Response) => void ok(res, await leaveService.pendingForApprover(req)))
);

leaveRouter.patch(
  "/requests/:id/approve",
  requirePermission(PERMISSIONS.LEAVE_APPROVE),
  validate({ body: DecideLeaveSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await leaveService.decide(req, req.params["id"] as string, "APPROVED", (req.body as { remarks?: string }).remarks), "Leave approved.")
  )
);

leaveRouter.patch(
  "/requests/:id/reject",
  requirePermission(PERMISSIONS.LEAVE_APPROVE),
  validate({ body: DecideLeaveSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await leaveService.decide(req, req.params["id"] as string, "REJECTED", (req.body as { remarks?: string }).remarks), "Leave rejected.")
  )
);

leaveRouter.patch(
  "/requests/:id/request-info",
  requirePermission(PERMISSIONS.LEAVE_APPROVE),
  validate({ body: RequestInfoSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await leaveService.requestMoreInfo(req, req.params["id"] as string, (req.body as { note: string }).note), "Clarification requested.")
  )
);

leaveRouter.post(
  "/requests/bulk-approve",
  requirePermission(PERMISSIONS.LEAVE_APPROVE),
  validate({ body: BulkApproveSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { requestIds, remarks } = req.body as { requestIds: string[]; remarks?: string };
    ok(res, await leaveService.bulkApprove(req, requestIds, remarks));
  })
);

// ---- calendars & holidays ----
leaveRouter.get(
  "/calendar",
  requirePermission(PERMISSIONS.LEAVE_READ),
  validate({ query: CalendarQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = getQuery<CalendarQuery>(res);
    ok(res, await leaveService.calendar(req, q.month, q.year, q.scope));
  })
);

leaveRouter.get(
  "/holidays",
  validate({ query: z.object({ year: z.coerce.number().int().default(new Date().getFullYear()) }) }),
  asyncHandler(async (_req: Request, res: Response) => {
    const { year } = getQuery<{ year: number }>(res);
    ok(res, await leaveService.listHolidays(year));
  })
);

leaveRouter.post(
  "/holidays",
  requirePermission(PERMISSIONS.LEAVE_MANAGE),
  validate({ body: HolidaySchema }),
  asyncHandler(async (req: Request, res: Response) => void created(res, await leaveService.addHoliday(req, req.body)))
);

leaveRouter.delete(
  "/holidays/:id",
  requirePermission(PERMISSIONS.LEAVE_MANAGE),
  asyncHandler(async (req: Request, res: Response) => {
    await leaveService.removeHoliday(req, req.params["id"] as string);
    noContent(res);
  })
);

// ---- workflow configuration ----
leaveRouter.get(
  "/workflow",
  requirePermission(PERMISSIONS.LEAVE_APPROVE, PERMISSIONS.LEAVE_MANAGE),
  asyncHandler(async (_req: Request, res: Response) => void ok(res, await leaveService.getWorkflow()))
);

leaveRouter.put(
  "/workflow",
  requirePermission(PERMISSIONS.LEAVE_MANAGE),
  validate({ body: WorkflowStepsSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await leaveService.setWorkflow(req, (req.body as { steps: never[] }).steps), "Approval workflow updated.")
  )
);
