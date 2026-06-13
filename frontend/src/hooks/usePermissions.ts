import { useAuthStore } from "@/stores/auth";

/**
 * Permission-driven UI: every menu item, page, button and action checks the
 * backend-provided permission set from /auth/me. No role names or access
 * rules are hardcoded in the frontend.
 */
export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const set = new Set(user?.permissions ?? []);

  const can = (...codes: string[]): boolean => codes.some((c) => set.has(c));
  const canAll = (...codes: string[]): boolean => codes.every((c) => set.has(c));

  return { can, canAll, permissions: set };
}
