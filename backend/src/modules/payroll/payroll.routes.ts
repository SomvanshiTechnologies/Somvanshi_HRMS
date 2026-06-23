import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { payrollService } from "./payroll.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate, getQuery } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created } from "../../core/http.js";
import { heavyLimiter } from "../../middleware/rateLimit.middleware.js";
import { upload } from "../files/files.routes.js";
import { BadRequestError } from "../../core/errors.js";
import { PayslipEditSchema, ManualPayslipSchema, ComponentSchema, StructureSchema, StatutoryConfigSchema } from "./payroll.schema.js";

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
const SinglePayslipSchema = z.object({
  employeeId: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  netPay: z.coerce.number().min(0).optional(),
  grossEarnings: z.coerce.number().min(0).optional(),
  totalDeductions: z.coerce.number().min(0).optional(),
});

export const payrollRouter: Router = Router();
payrollRouter.use(requireAuth);

// salary components & structures
payrollRouter.get("/components", requirePermission(PERMISSIONS.PAYROLL_MANAGE), asyncHandler(async (_req: Request, res: Response) => void ok(res, await payrollService.listComponents())));
payrollRouter.post("/components", requirePermission(PERMISSIONS.PAYROLL_MANAGE), validate({ body: ComponentSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await payrollService.createComponent(req, req.body), "Component created.")));
payrollRouter.put("/components/:id", requirePermission(PERMISSIONS.PAYROLL_MANAGE), validate({ body: ComponentSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.updateComponent(req, req.params["id"] as string, req.body), "Component updated.")));

payrollRouter.get("/structures", requirePermission(PERMISSIONS.PAYROLL_READ_ALL, PERMISSIONS.PAYROLL_MANAGE), asyncHandler(async (_req: Request, res: Response) => void ok(res, await payrollService.listStructures())));
payrollRouter.post("/structures", requirePermission(PERMISSIONS.PAYROLL_MANAGE), validate({ body: StructureSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await payrollService.createStructure(req, req.body), "Structure created.")));
payrollRouter.put("/structures/:id", requirePermission(PERMISSIONS.PAYROLL_MANAGE), validate({ body: StructureSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.updateStructure(req, req.params["id"] as string, req.body), "Structure updated.")));

// statutory config
payrollRouter.get("/statutory-config", requirePermission(PERMISSIONS.PAYROLL_MANAGE), asyncHandler(async (_req: Request, res: Response) => void ok(res, await payrollService.statutoryConfig())));
payrollRouter.put("/statutory-config", requirePermission(PERMISSIONS.PAYROLL_MANAGE), validate({ body: StatutoryConfigSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.updateStatutoryConfig(req, req.body), "Configuration updated.")));

// salaries
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
payrollRouter.post(
  "/payslips/import-single",
  requirePermission(PERMISSIONS.PAYROLL_MANAGE),
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError("Upload a payslip PDF (field name 'file')");
    const body = SinglePayslipSchema.parse(req.body);
    created(res, await payrollService.importSinglePayslip(req, body, req.file), "Payslip imported.");
  })
);
payrollRouter.post(
  "/payslips/manual",
  requirePermission(PERMISSIONS.PAYROLL_MANAGE),
  validate({ body: ManualPayslipSchema }),
  asyncHandler(async (req: Request, res: Response) => void created(res, await payrollService.createManualPayslip(req, req.body), "Payslip created."))
);
payrollRouter.get(
  "/payslips/all",
  requirePermission(PERMISSIONS.PAYROLL_READ_ALL),
  asyncHandler(async (req: Request, res: Response) => {
    const month = req.query["month"] ? Number(req.query["month"]) : undefined;
    const year = req.query["year"] ? Number(req.query["year"]) : undefined;
    ok(res, await payrollService.allPayslips(month, year));
  })
);
payrollRouter.delete(
  "/payslips/:id",
  requirePermission(PERMISSIONS.PAYROLL_MANAGE),
  asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.deletePayslip(req, req.params["id"] as string), "Payslip deleted."))
);
payrollRouter.put(
  "/payslips/:id/pdf",
  requirePermission(PERMISSIONS.PAYROLL_MANAGE),
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError("Upload the replacement PDF (field name 'file')");
    ok(res, await payrollService.replacePayslipPdf(req, req.params["id"] as string, req.file), "Payslip PDF replaced.");
  })
);
payrollRouter.get("/payslips/me", requirePermission(PERMISSIONS.PAYROLL_READ), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.myPayslips(req))));
payrollRouter.get("/payslips/:id", requirePermission(PERMISSIONS.PAYROLL_READ), asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.payslipDetail(req, req.params["id"] as string))));
payrollRouter.patch(
  "/payslips/:id",
  requirePermission(PERMISSIONS.PAYROLL_MANAGE),
  validate({ body: PayslipEditSchema }),
  asyncHandler(async (req: Request, res: Response) => void ok(res, await payrollService.updatePayslip(req, req.params["id"] as string, req.body), "Payslip updated."))
);
payrollRouter.post("/payslips/:id/email", requirePermission(PERMISSIONS.PAYROLL_READ), asyncHandler(async (req: Request, res: Response) => { await payrollService.emailPayslip(req, req.params["id"] as string); ok(res, null, "Payslip emailed to you."); }));
payrollRouter.get(
  "/payslips/:id/pdf",
  requirePermission(PERMISSIONS.PAYROLL_READ),
  asyncHandler(async (req: Request, res: Response) => {
    const pdf = await payrollService.payslipPdf(req, req.params["id"] as string);
    res.header("Content-Type", "application/pdf").header("Content-Disposition", `inline; filename="payslip-${req.params["id"]}.pdf"`).send(pdf);
  })
);
