import { Router } from "express";
import type { Request, Response } from "express";
import { attendanceService } from "./attendance.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate, getQuery } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created } from "../../core/http.js";
import {
  AssignShiftSchema,
  CorrectionDecisionSchema,
  CorrectionRequestSchema,
  CreateShiftSchema,
  DayQuerySchema,
  ManualMarkSchema,
  MonthQuerySchema,
  PunchSchema,
  type DayQuery,
  type MonthQuery,
} from "./attendance.schema.js";

export const attendanceRouter: Router = Router();
attendanceRouter.use(requireAuth);

/** Org-wide visibility = HR/admin-class roles; managers see their reports. */
function isOrgWide(req: Request): boolean {
  return req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE", "FINANCE_MANAGER"].includes(r));
}

// ---- punches ----
attendanceRouter.get("/today", requirePermission(PERMISSIONS.ATTENDANCE_READ), asyncHandler(async (req: Request, res: Response) => void ok(res, await attendanceService.today(req))));
attendanceRouter.post("/check-in", requirePermission(PERMISSIONS.ATTENDANCE_CREATE), validate({ body: PunchSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await attendanceService.checkIn(req, req.body), "Checked in. Have a great day!")));
attendanceRouter.post("/check-out", requirePermission(PERMISSIONS.ATTENDANCE_CREATE), validate({ body: PunchSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await attendanceService.checkOut(req, req.body), "Checked out. See you tomorrow!")));
attendanceRouter.post("/breaks/start", requirePermission(PERMISSIONS.ATTENDANCE_CREATE), asyncHandler(async (req: Request, res: Response) => void ok(res, await attendanceService.startBreak(req))));
attendanceRouter.post("/breaks/end", requirePermission(PERMISSIONS.ATTENDANCE_CREATE), asyncHandler(async (req: Request, res: Response) => void ok(res, await attendanceService.endBreak(req))));

// ---- my calendar ----
attendanceRouter.get(
  "/me",
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate({ query: MonthQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = getQuery<MonthQuery>(res);
    ok(res, await attendanceService.myMonth(req, q.month, q.year));
  })
);

// ---- corrections ----
attendanceRouter.post("/corrections", requirePermission(PERMISSIONS.ATTENDANCE_CREATE), validate({ body: CorrectionRequestSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await attendanceService.requestCorrection(req, req.body), "Correction submitted for approval.")));
attendanceRouter.get("/corrections/me", requirePermission(PERMISSIONS.ATTENDANCE_READ), asyncHandler(async (req: Request, res: Response) => void ok(res, await attendanceService.myCorrections(req))));
attendanceRouter.get("/corrections/pending", requirePermission(PERMISSIONS.ATTENDANCE_APPROVE), asyncHandler(async (req: Request, res: Response) => void ok(res, await attendanceService.pendingCorrections(req, isOrgWide(req)))));
attendanceRouter.patch(
  "/corrections/:id/approve",
  requirePermission(PERMISSIONS.ATTENDANCE_APPROVE),
  validate({ body: CorrectionDecisionSchema }),
  asyncHandler(async (req: Request, res: Response) => void ok(res, await attendanceService.decideCorrection(req, req.params["id"] as string, "APPROVED", (req.body as { remarks?: string }).remarks), "Correction approved."))
);
attendanceRouter.patch(
  "/corrections/:id/reject",
  requirePermission(PERMISSIONS.ATTENDANCE_APPROVE),
  validate({ body: CorrectionDecisionSchema }),
  asyncHandler(async (req: Request, res: Response) => void ok(res, await attendanceService.decideCorrection(req, req.params["id"] as string, "REJECTED", (req.body as { remarks?: string }).remarks), "Correction rejected."))
);

// ---- team / org ----
attendanceRouter.get(
  "/day",
  requirePermission(PERMISSIONS.ATTENDANCE_READ_ALL),
  validate({ query: DayQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = getQuery<DayQuery>(res);
    ok(res, await attendanceService.dayView(req, q.date, q.departmentId, isOrgWide(req)));
  })
);

attendanceRouter.get(
  "/employee/:id",
  requirePermission(PERMISSIONS.ATTENDANCE_READ_ALL),
  validate({ query: MonthQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = getQuery<MonthQuery>(res);
    ok(res, await attendanceService.monthFor(req.params["id"] as string, q.month, q.year));
  })
);

attendanceRouter.post("/manual", requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), validate({ body: ManualMarkSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await attendanceService.manualMark(req, req.body), "Attendance marked.")));

attendanceRouter.get(
  "/export",
  requirePermission(PERMISSIONS.ATTENDANCE_EXPORT),
  validate({ query: MonthQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = getQuery<MonthQuery>(res);
    const csv = await attendanceService.exportCsv(req, q.month, q.year, isOrgWide(req));
    res
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="somhr-attendance-${q.year}-${String(q.month).padStart(2, "0")}.csv"`)
      .send(csv);
  })
);

// ---- shifts ----
attendanceRouter.get("/shifts", requirePermission(PERMISSIONS.ATTENDANCE_READ), asyncHandler(async (_req: Request, res: Response) => void ok(res, await attendanceService.listShifts())));
attendanceRouter.post("/shifts", requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), validate({ body: CreateShiftSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await attendanceService.createShift(req, req.body))));
attendanceRouter.post("/shifts/assign", requirePermission(PERMISSIONS.ATTENDANCE_MANAGE), validate({ body: AssignShiftSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await attendanceService.assignShift(req, req.body), "Shift assigned.")));
