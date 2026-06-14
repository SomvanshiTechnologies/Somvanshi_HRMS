import { z } from "zod";

export const CreateRoleSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE"),
  displayName: z.string().min(2).max(80),
  description: z.string().max(300).optional(),
});

export const UpdateRoleSchema = CreateRoleSchema.partial().omit({ name: true });

export const CloneRoleSchema = CreateRoleSchema;

export const SetRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string().regex(/^[a-z_]+:[a-z_]+$/)).max(200),
});

export const SetUserRolesSchema = z.object({
  roleIds: z.array(z.string().min(1)).min(1).max(10),
});

export type CloneRoleInput = z.infer<typeof CloneRoleSchema>;
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type SetRolePermissionsInput = z.infer<typeof SetRolePermissionsSchema>;
export type SetUserRolesInput = z.infer<typeof SetUserRolesSchema>;
