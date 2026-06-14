import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

export type PermissionCatalog = Record<
  string,
  Array<{ id: string; code: string; action: string; description: string | null }>
>;

export interface RbacUser {
  id: string;
  email: string;
  status: string;
  employee: {
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    employeeCode: string;
    designation: { title: string } | null;
    department: { name: string } | null;
  } | null;
  roles: Array<{ id: string; name: string; displayName: string }>;
}

export function useRoles() {
  return useQuery({
    queryKey: ["rbac", "roles"],
    queryFn: async () => (await api.get<{ data: Role[] }>("/rbac/roles")).data.data,
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ["rbac", "permissions"],
    queryFn: async () => (await api.get<{ data: PermissionCatalog }>("/rbac/permissions")).data.data,
  });
}

export function useRbacUsers(enabled = true) {
  return useQuery({
    queryKey: ["rbac", "users"],
    enabled,
    queryFn: async () => (await api.get<{ data: RbacUser[] }>("/rbac/users")).data.data,
  });
}

function useRbacMutation<T>(fn: (input: T) => Promise<unknown>, msg: string | ((input: T) => string)) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_res, input) => {
      toast.success(typeof msg === "function" ? msg(input) : msg);
      void queryClient.invalidateQueries({ queryKey: ["rbac"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export interface RoleInput { name: string; displayName: string; description?: string }

export const useCreateRole = () => useRbacMutation((input: RoleInput) => api.post("/rbac/roles", input), "Role created.");
export const useCloneRole = () =>
  useRbacMutation((input: { id: string } & RoleInput) => { const { id, ...body } = input; return api.post(`/rbac/roles/${id}/clone`, body); }, "Role cloned.");
export const useUpdateRole = () =>
  useRbacMutation((input: { id: string; displayName?: string; description?: string }) => { const { id, ...body } = input; return api.patch(`/rbac/roles/${id}`, body); }, "Role updated.");
export const useDeleteRole = () =>
  useRbacMutation((input: { id: string }) => api.delete(`/rbac/roles/${input.id}`), "Role deleted.");
export const useSetRolePermissions = () =>
  useRbacMutation((input: { id: string; permissionCodes: string[] }) => api.put(`/rbac/roles/${input.id}/permissions`, { permissionCodes: input.permissionCodes }), "Permissions updated.");
export const useSetUserRoles = () =>
  useRbacMutation((input: { userId: string; roleIds: string[] }) => api.put(`/rbac/users/${input.userId}/roles`, { roleIds: input.roleIds }), "Member access updated.");
