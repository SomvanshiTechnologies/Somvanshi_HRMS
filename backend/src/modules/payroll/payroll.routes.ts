import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { payrollService } from "./payroll.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created } from "../../core/http.js";
import { heavyLimiter } from "../../middleware/rateLimit.middleware.js";

const SetSalarySchema = z.object({
  structureId: z.string().min(1),
  annualCtc: z.number().positive().max(100_00_00_000),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  reason: z.string().max(200).optional(),
});
const RunSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
});

export const payrollRouter: Router = Router();
payrollRouter.use(requireAuth);

// reference + salaries
payrollRouter.get("/structures", requirePermission(PERMISSIONS.PAYROLL_READ_ALL, PERMISSIONS.PAYROLL_MANAGE), asyncHandler(async (_req: Request, res: Response) => void ok(res, await payrollService.listStructures())));
payrollRouter.get("/employees", requirePermission(PERMISSIONS.PAYROLL_READ_ALL), asyncHandler(async (_req: Request, res: Response) => void ok(res, await payrollService.employeesWithSalary())));
payrollRouter.put("/employees/:id/salary", requirePermission(PERMISSIONS.PAYROLL_MANAGE), validate({ body: SetSalarySchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.setSalary(req, req.params["id"] as string, req.body), "Salary updated.")));

payrollRouter.get(
  "/revisions",
  requirePermission(PERMISSIONS.PAYROLL_READ, PERMISSIONS.PAYROLL_READ_ALL),
  asyncHandler(async (req: Request, res: Response) => {
    const orgWide = req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "FINANCE_MANAGER"].includes(r));
    ok(res, await payrollService.revisions(orgWide ? (req.query["employeeId"] as string | undefined) : req.user!.employeeId ?? "none"));
  })
);

// runs
payrollRouter.get("/runs", requirePermission(PERMISSIONS.PAYROLL_READ_ALL), asyncHandler(async (_req: Request, res: Response) => void ok(res, await payrollService.listRuns())));
payrollRouter.get("/runs/:id", requirePermission(PERMISSIONS.PAYROLL_READ_ALL), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.getRun(req.params["id"] as string))));
payrollRouter.post("/runs", heavyLimiter, requirePermission(PERMISSIONS.PAYROLL_RUN), validate({ body: RunSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { month, year } = req.body as { month: number; year: number };
  created(res, await payrollService.processRun(req, month, year), "Payroll processed — review and approve.");
}));
payrollRouter.patch("/runs/:id/approve", requirePermission(PERMISSIONS.PAYROLL_APPROVE), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.approveRun(req, req.params["id"] as string), "Payroll approved — payslips published and emailed.")));
payrollRouter.patch("/runs/:id/mark-paid", requirePermission(PERMISSIONS.PAYROLL_APPROVE), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.markPaid(req, req.params["id"] as string), "Marked as paid.")));

payrollRouter.get(
  "/runs/:id/register",
  requirePermission(PERMISSIONS.PAYROLL_EXPORT),
  asyncHandler(async (req: Request, res: Response) => {
    const { csv, filename } = await payrollService.registerCsv(req.params["id"] as string);
    res.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", `attachment; filename="${filename}"`).send(csv);
  })
);

// payslips
payrollRouter.get("/payslips/me", requirePermission(PERMISSIONS.PAYROLL_READ), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.myPayslips(req))));
payrollRouter.get("/payslips/:id", requirePermission(PERMISSIONS.PAYROLL_READ), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.payslipDetail(req, req.params["id"] as string))));
payrollRouter.post("/payslips/:id/email", requirePermission(PERMISSIONS.PAYROLL_READ), asyncHandler(async (req: Request, res: Response) => { await payrollService.emailPayslip(req, req.params["id"] as string); ok(res, null, "Payslip emailed to you."); }));
payrollRouter.get(
  "/payslips/:id/pdf",
  requirePermission(PERMISSIONS.PAYROLL_READ),
  asyncHandler(async (req: Request, res: Response) => {
    const pdf = await payrollService.payslipPdf(req, req.params["id"] as string);
    res.header("Content-Type", "application/pdf").header("Content-Disposition", `inline; filename="payslip-${req.params["id"]}.pdf"`).send(pdf);
  })
);
