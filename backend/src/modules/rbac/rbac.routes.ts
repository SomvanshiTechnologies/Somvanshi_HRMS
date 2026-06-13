import { Router } from "express";
import type { Request, Response } from "express";
import { rbacService } from "./rbac.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { validate } from "../../middleware/validate.middleware.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok, created, noContent } from "../../core/http.js";
import {
  CreateRoleSchema,
  SetRolePermissionsSchema,
  SetUserRolesSchema,
  UpdateRoleSchema,
  type CreateRoleInput,
  type SetRolePermissionsInput,
  type SetUserRolesInput,
  type UpdateRoleInput,
} from "./rbac.schema.js";

export const rbacRouter: Router = Router();

rbacRouter.use(requireAuth);

rbacRouter.get(
  "/roles",
  requirePermission(PERMISSIONS.ROLES_READ, PERMISSIONS.ROLES_MANAGE),
  asyncHandler(async (_req: Request, res: Response) => void ok(res, await rbacService.listRoles()))
);

rbacRouter.get(
  "/permissions",
  requirePermission(PERMISSIONS.ROLES_READ, PERMISSIONS.ROLES_MANAGE),
  asyncHandler(async (_req: Request, res: Response) => void ok(res, await rbacService.listPermissions()))
);

rbacRouter.post(
  "/roles",
  requirePermission(PERMISSIONS.ROLES_MANAGE),
  validate({ body: CreateRoleSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void created(res, await rbacService.createRole(req.body as CreateRoleInput, req))
  )
);

rbacRouter.patch(
  "/roles/:id",
  requirePermission(PERMISSIONS.ROLES_MANAGE),
  validate({ body: UpdateRoleSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(res, await rbacService.updateRole(req.params["id"] as string, req.body as UpdateRoleInput, req))
  )
);

rbacRouter.delete(
  "/roles/:id",
  requirePermission(PERMISSIONS.ROLES_MANAGE),
  asyncHandler(async (req: Request, res: Response) => {
    await rbacService.deleteRole(req.params["id"] as string, req);
    noContent(res);
  })
);

rbacRouter.put(
  "/roles/:id/permissions",
  requirePermission(PERMISSIONS.ROLES_MANAGE),
  validate({ body: SetRolePermissionsSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(
      res,
      await rbacService.setRolePermissions(
        req.params["id"] as string,
        (req.body as SetRolePermissionsInput).permissionCodes,
        req
      )
    )
  )
);

rbacRouter.put(
  "/users/:id/roles",
  requirePermission(PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_MANAGE),
  validate({ body: SetUserRolesSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    void ok(
      res,
      await rbacService.setUserRoles(
        req.params["id"] as string,
        (req.body as SetUserRolesInput).roleIds,
        req.user!.id,
        req
      )
    )
  )
);
