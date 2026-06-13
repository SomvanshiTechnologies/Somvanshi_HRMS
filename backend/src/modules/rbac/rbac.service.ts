import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../core/errors.js";
import { invalidatePermissionCache } from "../../middleware/rbac.middleware.js";
import { audit } from "../audit/audit.service.js";
import type { CreateRoleInput, UpdateRoleInput } from "./rbac.schema.js";

export const rbacService = {
  async listRoles() {
    return prisma.role.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { users: true } },
        permissions: { select: { permission: { select: { code: true } } } },
      },
    }).then((roles) =>
      roles.map((r) => ({
        id: r.id,
        name: r.name,
        displayName: r.displayName,
        description: r.description,
        isSystem: r.isSystem,
        userCount: r._count.users,
        permissions: r.permissions.map((p) => p.permission.code),
      }))
    );
  },

  async listPermissions() {
    const rows = await prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
    // grouped by module for the role-editor UI
    const grouped: Record<string, { id: string; code: string; action: string; description: string | null }[]> = {};
    for (const p of rows) {
      (grouped[p.module] ??= []).push({ id: p.id, code: p.code, action: p.action, description: p.description });
    }
    return grouped;
  },

  async createRole(input: CreateRoleInput, req?: Request) {
    const exists = await prisma.role.findUnique({ where: { name: input.name } });
    if (exists) throw new ConflictError(`Role ${input.name} already exists`);
    const role = await prisma.role.create({
      data: { name: input.name, displayName: input.displayName, description: input.description ?? null },
    });
    audit({ action: "role.create", entity: "Role", entityId: role.id, after: role, req });
    return role;
  },

  async updateRole(id: string, input: UpdateRoleInput, req?: Request) {
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundError("Role");
    const updated = await prisma.role.update({ where: { id }, data: input });
    audit({ action: "role.update", entity: "Role", entityId: id, before: role, after: updated, req });
    return updated;
  },

  async deleteRole(id: string, req?: Request): Promise<void> {
    const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundError("Role");
    if (role.isSystem) throw new BadRequestError("System roles cannot be deleted");
    if (role._count.users > 0) throw new BadRequestError("Reassign users before deleting this role");
    await prisma.role.delete({ where: { id } });
    audit({ action: "role.delete", entity: "Role", entityId: id, before: role, req });
  },

  /** Replace a role's permission set (the role-editor saves the whole matrix). */
  async setRolePermissions(roleId: string, permissionCodes: string[], req?: Request) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundError("Role");

    const perms = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    const found = new Set(perms.map((p) => p.code));
    const missing = permissionCodes.filter((c) => !found.has(c));
    if (missing.length) throw new BadRequestError(`Unknown permission codes: ${missing.join(", ")}`);

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) }),
    ]);
    await invalidatePermissionCache(); // affects every user holding this role
    audit({ action: "role.set_permissions", entity: "Role", entityId: roleId, after: { permissionCodes }, req });
    return this.listRoles().then((roles) => roles.find((r) => r.id === roleId));
  },

  /** Replace a user's role assignments. */
  async setUserRoles(userId: string, roleIds: string[], actorId: string, req?: Request) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User");
    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) throw new BadRequestError("One or more roles do not exist");

    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId } }),
      prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId, assignedBy: actorId })),
      }),
    ]);
    await invalidatePermissionCache(userId);
    audit({ action: "user.set_roles", entity: "User", entityId: userId, after: { roleIds }, req });
    return prisma.userRole.findMany({ where: { userId }, include: { role: true } });
  },
};
