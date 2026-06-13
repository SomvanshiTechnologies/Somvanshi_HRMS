import { Router } from "express";
import type { Request, Response } from "express";
import { employeesService, type EmployeeScope } from "./employees.service.js";
import { subresourcesService } from "./employees.subresources.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate, getQuery } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission, resolvePermissions } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created, noContent, paginated } from "../../core/http.js";
import { ForbiddenError, UnauthorizedError } from "../../core/errors.js";
import { prisma } from "../../config/db.js";
import {
  BankDetailSchema,
  CertificationSchema,
  CreateEmployeeSchema,
  EducationSchema,
  EmergencyContactSchema,
  EmployeeListQuerySchema,
  EmployeeSkillSchema,
  ExperienceSchema,
  LifecycleTransitionSchema,
  UpdateEmployeeSchema,
  type EmployeeListQuery,
} from "./employees.schema.js";

export const employeesRouter: Router = Router();
employeesRouter.use(requireAuth);

/**
 * Resolve row scope from the caller's DB-driven permissions and role shape:
 *  - employees:read_all + org-wide role (HR/recruiter/finance/admin) → all rows
 *  - employees:read_all + DEPARTMENT_HEAD → their department
 *  - employees:read_all + MANAGER/TEAM_LEAD → their reporting line
 *  - employees:read only → self
 */
async function resolveScope(req: Request): Promise<EmployeeScope> {
  const user = req.user;
  if (!user) throw new UnauthorizedError();
  const perms = await resolvePermissions(user.id);
  if (!perms.has(PERMISSIONS.EMPLOYEES_READ_ALL)) {
    if (!user.employeeId) throw new ForbiddenError("No employee profile linked to this account");
    return { kind: "self", employeeId: user.employeeId };
  }
  const orgWide = ["SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE", "RECRUITER", "FINANCE_MANAGER"];
  if (user.roles.some((r) => orgWide.includes(r))) return { kind: "all" };
  if (user.roles.includes("DEPARTMENT_HEAD") && user.employeeId) {
    const me = await prisma.employee.findUnique({ where: { id: user.employeeId }, select: { departmentId: true } });
    if (me?.departmentId) return { kind: "department", departmentId: me.departmentId };
  }
  if (user.employeeId) return { kind: "team", managerEmployeeId: user.employeeId };
  return { kind: "all" };
}

/** Whether the caller may edit profiles other than their own. */
async function isPrivileged(req: Request): Promise<boolean> {
  const perms = await resolvePermissions(req.user!.id);
  return perms.has(PERMISSIONS.EMPLOYEES_MANAGE) || perms.has(PERMISSIONS.EMPLOYEES_UPDATE);
}

// ---- collection ----

employeesRouter.get(
  "/",
  requirePermission(PERMISSIONS.EMPLOYEES_READ, PERMISSIONS.EMPLOYEES_READ_ALL),
  validate({ query: EmployeeListQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await employeesService.list(getQuery<EmployeeListQuery>(res), await resolveScope(req));
    paginated(res, result.data, result.meta);
  })
);

employeesRouter.get(
  "/export",
  requirePermission(PERMISSIONS.EMPLOYEES_EXPORT),
  validate({ query: EmployeeListQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const csv = await employeesService.exportCsv(getQuery<EmployeeListQuery>(res), await resolveScope(req));
    res
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="somhr-employees-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(csv);
  })
);

employeesRouter.get(
  "/org-chart",
  requirePermission(PERMISSIONS.EMPLOYEES_READ, PERMISSIONS.EMPLOYEES_READ_ALL),
  asyncHandler(async (_req: Request, res: Response) => void ok(res, await employeesService.orgChart()))
);

employeesRouter.post(
  "/",
  requirePermission(PERMISSIONS.EMPLOYEES_CREATE),
  validate({ body: CreateEmployeeSchema }),
  asyncHandler(async (req: Request, res: Response) => void created(res, await employeesService.create(req.body, req)))
);

// ---- item ----

employeesRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.EMPLOYEES_READ, PERMISSIONS.EMPLOYEES_READ_ALL),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await employeesService.getById(req.params["id"] as string, await resolveScope(req)))
  )
);

employeesRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.EMPLOYEES_UPDATE, PERMISSIONS.EMPLOYEES_MANAGE),
  validate({ body: UpdateEmployeeSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await employeesService.update(req.params["id"] as string, req.body, await resolveScope(req), req))
  )
);

employeesRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.EMPLOYEES_DELETE),
  asyncHandler(async (req: Request, res: Response) => {
    await employeesService.softDelete(req.params["id"] as string, req);
    noContent(res);
  })
);

employeesRouter.post(
  "/:id/lifecycle",
  requirePermission(PERMISSIONS.EMPLOYEES_MANAGE),
  validate({ body: LifecycleTransitionSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await employeesService.transition(req.params["id"] as string, req.body, req))
  )
);

employeesRouter.get(
  "/:id/timeline",
  requirePermission(PERMISSIONS.EMPLOYEES_READ, PERMISSIONS.EMPLOYEES_READ_ALL),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await employeesService.timeline(req.params["id"] as string, await resolveScope(req)))
  )
);

// ---- sub-resources (self-service or privileged) ----

function selfOrPrivileged(handler: (req: Request, res: Response) => Promise<void>) {
  return asyncHandler(async (req: Request, res: Response) => {
    employeesService.assertSelfOrPrivileged(req.params["id"] as string, req, await isPrivileged(req));
    await handler(req, res);
  });
}

employeesRouter.post("/:id/educations", validate({ body: EducationSchema }), selfOrPrivileged(async (req, res) => void created(res, await subresourcesService.addEducation(req.params["id"] as string, req.body, req))));
employeesRouter.patch("/:id/educations/:itemId", validate({ body: EducationSchema.partial() }), selfOrPrivileged(async (req, res) => void ok(res, await subresourcesService.updateEducation(req.params["id"] as string, req.params["itemId"] as string, req.body, req))));
employeesRouter.delete("/:id/educations/:itemId", selfOrPrivileged(async (req, res) => { await subresourcesService.deleteEducation(req.params["id"] as string, req.params["itemId"] as string, req); noContent(res); }));

employeesRouter.post("/:id/experiences", validate({ body: ExperienceSchema }), selfOrPrivileged(async (req, res) => void created(res, await subresourcesService.addExperience(req.params["id"] as string, req.body, req))));
employeesRouter.patch("/:id/experiences/:itemId", validate({ body: ExperienceSchema.partial() }), selfOrPrivileged(async (req, res) => void ok(res, await subresourcesService.updateExperience(req.params["id"] as string, req.params["itemId"] as string, req.body, req))));
employeesRouter.delete("/:id/experiences/:itemId", selfOrPrivileged(async (req, res) => { await subresourcesService.deleteExperience(req.params["id"] as string, req.params["itemId"] as string, req); noContent(res); }));

employeesRouter.post("/:id/certifications", validate({ body: CertificationSchema }), selfOrPrivileged(async (req, res) => void created(res, await subresourcesService.addCertification(req.params["id"] as string, req.body, req))));
employeesRouter.delete("/:id/certifications/:itemId", selfOrPrivileged(async (req, res) => { await subresourcesService.deleteCertification(req.params["id"] as string, req.params["itemId"] as string, req); noContent(res); }));

employeesRouter.put("/:id/skills", validate({ body: EmployeeSkillSchema }), selfOrPrivileged(async (req, res) => void ok(res, await subresourcesService.setSkill(req.params["id"] as string, req.body, req))));
employeesRouter.delete("/:id/skills/:skillId", selfOrPrivileged(async (req, res) => { await subresourcesService.removeSkill(req.params["id"] as string, req.params["skillId"] as string, req); noContent(res); }));

employeesRouter.post("/:id/bank-details", validate({ body: BankDetailSchema }), selfOrPrivileged(async (req, res) => void created(res, await subresourcesService.addBankDetail(req.params["id"] as string, req.body, req))));
employeesRouter.put("/:id/bank-details/:itemId", validate({ body: BankDetailSchema.partial() }), selfOrPrivileged(async (req, res) => void ok(res, await subresourcesService.updateBankDetail(req.params["id"] as string, req.params["itemId"] as string, req.body, req), "Bank details updated.")));
employeesRouter.delete("/:id/bank-details/:itemId", selfOrPrivileged(async (req, res) => { await subresourcesService.deleteBankDetail(req.params["id"] as string, req.params["itemId"] as string, req); noContent(res); }));

employeesRouter.post("/:id/emergency-contacts", validate({ body: EmergencyContactSchema }), selfOrPrivileged(async (req, res) => void created(res, await subresourcesService.addEmergencyContact(req.params["id"] as string, req.body, req))));
employeesRouter.delete("/:id/emergency-contacts/:itemId", selfOrPrivileged(async (req, res) => { await subresourcesService.deleteEmergencyContact(req.params["id"] as string, req.params["itemId"] as string, req); noContent(res); }));
