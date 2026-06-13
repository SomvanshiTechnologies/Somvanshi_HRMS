import { Router } from "express";
import type { Request, Response } from "express";
import { orgService } from "./org.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created, noContent } from "../../core/http.js";
import {
  CreateBandSchema,
  CreateDepartmentSchema,
  CreateDesignationSchema,
  CreateLocationSchema,
  UpdateDepartmentSchema,
  UpdateDesignationSchema,
  UpdateLocationSchema,
  UpsertCompanySchema,
} from "./org.schema.js";

export const orgRouter: Router = Router();

orgRouter.use(requireAuth);

const canRead = requirePermission(PERMISSIONS.ORG_READ, PERMISSIONS.ORG_MANAGE);
const canManage = requirePermission(PERMISSIONS.ORG_MANAGE);

// company
orgRouter.get("/company", canRead, asyncHandler(async (_req: Request, res: Response) => void ok(res, await orgService.getCompany())));
orgRouter.put("/company", canManage, validate({ body: UpsertCompanySchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await orgService.updateCompany(req.body, req))));

// locations
orgRouter.get("/locations", canRead, asyncHandler(async (_req: Request, res: Response) => void ok(res, await orgService.listLocations())));
orgRouter.post("/locations", canManage, validate({ body: CreateLocationSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await orgService.createLocation(req.body, req))));
orgRouter.patch("/locations/:id", canManage, validate({ body: UpdateLocationSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await orgService.updateLocation(req.params["id"] as string, req.body, req))));
orgRouter.delete("/locations/:id", canManage, asyncHandler(async (req: Request, res: Response) => { await orgService.deleteLocation(req.params["id"] as string, req); noContent(res); }));

// departments
orgRouter.get("/departments", canRead, asyncHandler(async (_req: Request, res: Response) => void ok(res, await orgService.listDepartments())));
orgRouter.post("/departments", canManage, validate({ body: CreateDepartmentSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await orgService.createDepartment(req.body, req))));
orgRouter.patch("/departments/:id", canManage, validate({ body: UpdateDepartmentSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await orgService.updateDepartment(req.params["id"] as string, req.body, req))));
orgRouter.delete("/departments/:id", canManage, asyncHandler(async (req: Request, res: Response) => { await orgService.deleteDepartment(req.params["id"] as string, req); noContent(res); }));

// designations
orgRouter.get("/designations", canRead, asyncHandler(async (_req: Request, res: Response) => void ok(res, await orgService.listDesignations())));
orgRouter.post("/designations", canManage, validate({ body: CreateDesignationSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await orgService.createDesignation(req.body, req))));
orgRouter.patch("/designations/:id", canManage, validate({ body: UpdateDesignationSchema }), asyncHandler(async (req: Request, res: Response) => void ok(res, await orgService.updateDesignation(req.params["id"] as string, req.body, req))));
orgRouter.delete("/designations/:id", canManage, asyncHandler(async (req: Request, res: Response) => { await orgService.deleteDesignation(req.params["id"] as string, req); noContent(res); }));

// bands
orgRouter.get("/bands", canRead, asyncHandler(async (_req: Request, res: Response) => void ok(res, await orgService.listBands())));
orgRouter.post("/bands", canManage, validate({ body: CreateBandSchema }), asyncHandler(async (req: Request, res: Response) => void created(res, await orgService.createBand(req.body, req))));
