import * as React from "react";
import { motion } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Copy, KeyRound, Lock, Pencil, Plus, Save, Search, ShieldCheck, Trash2, Users,
} from "lucide-react";
import {
  useCloneRole, useCreateRole, useDeleteRole, usePermissionCatalog, useRbacUsers,
  useRoles, useSetRolePermissions, useSetUserRoles, useUpdateRole,
  type PermissionCatalog, type Role,
} from "./useRbac";
import { usePermissions } from "@/hooks/usePermissions";
import { NAV_SECTIONS } from "@/app/nav";
import { apiErrorMessage } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";

/* ─────────────────────────── role create / edit / clone ─────────────────────────── */
const RoleFormSchema = z.object({
  name: z.string().min(3).max(50).regex(/^[A-Z][A-Z0-9_]*$/, "UPPER_SNAKE_CASE only"),
  displayName: z.string().min(2, "Required").max(80),
  description: z.string().max(300).optional().or(z.literal("")),
});
type RoleFormValues = z.infer<typeof RoleFormSchema>;

function RoleFormDialog({
  mode, role, open, onClose,
}: { mode: "create" | "edit" | "clone"; role: Role | null; open: boolean; onClose: () => void }) {
  const create = useCreateRole();
  const clone = useCloneRole();
  const update = useUpdateRole();
  const isEdit = mode === "edit";

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(RoleFormSchema),
    values: {
      name: mode === "edit" ? role?.name ?? "" : mode === "clone" ? `${role?.name ?? ""}_COPY` : "",
      displayName: mode === "edit" ? role?.displayName ?? "" : mode === "clone" ? `${role?.displayName ?? ""} (copy)` : "",
      description: (mode === "edit" || mode === "clone" ? role?.description : "") ?? "",
    },
  });

  // auto-derive UPPER_SNAKE name from the display name while creating
  const autoName = (v: string) => v.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const submit = form.handleSubmit(async (v) => {
    const body = { name: v.name, displayName: v.displayName, description: v.description || undefined };
    if (mode === "create") await create.mutateAsync(body);
    else if (mode === "clone") await clone.mutateAsync({ id: role!.id, ...body });
    else await update.mutateAsync({ id: role!.id, displayName: v.displayName, description: v.description || undefined });
    onClose();
  });

  const err = form.formState.errors;
  const pending = create.isPending || clone.isPending || update.isPending;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New role" : mode === "clone" ? `Clone ${role?.displayName}` : `Edit ${role?.displayName}`}</DialogTitle>
          <DialogDescription>
            {mode === "clone" ? "Creates a new role with the same permissions, which you can then adjust."
              : isEdit ? "Update the role's display name and description. The internal code can't change."
              : "Roles are database-driven — assign permissions after creating."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <FormField label="Display name" htmlFor="rf-dn" required error={err.displayName?.message}>
            <Input
              id="rf-dn"
              {...form.register("displayName")}
              onChange={(e) => {
                form.setValue("displayName", e.target.value, { shouldDirty: true });
                if (!isEdit && !form.formState.dirtyFields.name) form.setValue("name", autoName(e.target.value));
              }}
              placeholder="e.g. Regional HR Manager"
            />
          </FormField>
          {!isEdit && (
            <FormField label="Role code" htmlFor="rf-name" required hint="UPPER_SNAKE_CASE, unique" error={err.name?.message}>
              <Input id="rf-name" className="font-mono" {...form.register("name")} placeholder="REGIONAL_HR_MANAGER" />
            </FormField>
          )}
          <FormField label="Description" htmlFor="rf-desc" error={err.description?.message}>
            <Textarea id="rf-desc" rows={2} {...form.register("description")} placeholder="What this role is for…" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={pending}>{mode === "edit" ? "Save" : mode === "clone" ? "Clone role" : "Create role"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── members (assign role to users) ─────────────────────────── */
function MembersTab({ role }: { role: Role }) {
  const users = useRbacUsers();
  const setUserRoles = useSetUserRoles();
  const [q, setQ] = React.useState("");

  if (users.isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>;
  if (users.isError) return <ErrorState message={apiErrorMessage(users.error)} onRetry={() => users.refetch()} />;

  const list = (users.data ?? []).filter((u) => {
    const name = `${u.employee?.firstName ?? ""} ${u.employee?.lastName ?? ""} ${u.email}`.toLowerCase();
    return !q || name.includes(q.toLowerCase());
  });

  const toggle = (u: (typeof list)[number]) => {
    const has = u.roles.some((r) => r.id === role.id);
    const roleIds = has ? u.roles.filter((r) => r.id !== role.id).map((r) => r.id) : [...u.roles.map((r) => r.id), role.id];
    if (roleIds.length === 0) return; // every account keeps at least one role
    setUserRoles.mutate({ userId: u.id, roleIds });
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-faint" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="pl-8" aria-label="Search people" />
      </div>
      <div className="space-y-1.5">
        {list.map((u) => {
          const has = u.roles.some((r) => r.id === role.id);
          const onlyRole = has && u.roles.length === 1;
          return (
            <div key={u.id} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", has ? "border-primary/30 bg-primary/5" : "border-border")}>
              <Avatar size="sm">{u.employee?.photoUrl && <AvatarImage src={u.employee.photoUrl} alt="" />}<AvatarFallback>{initials(u.employee?.firstName, u.employee?.lastName)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text truncate">{u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.email}</p>
                <p className="text-[11px] text-text-faint truncate">{u.employee?.designation?.title ?? u.email}</p>
              </div>
              <button
                role="switch"
                aria-checked={has}
                title={onlyRole ? "A user must keep at least one role" : undefined}
                disabled={onlyRole || setUserRoles.isPending}
                onClick={() => toggle(u)}
                className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer disabled:opacity-50", has ? "bg-primary" : "bg-border-strong")}
              >
                <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", has ? "left-[18px]" : "left-0.5")} />
              </button>
            </div>
          );
        })}
        {!list.length && <p className="text-sm text-text-faint py-6 text-center">No people match.</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────── view-as-role simulator ─────────────────────────── */
function PreviewTab({ permissions }: { permissions: Set<string> }) {
  const sections = NAV_SECTIONS.map((s) => ({
    title: s.title,
    items: s.items.map((it) => ({
      label: it.label,
      icon: it.icon,
      allowed: it.permissions.length === 0 || it.permissions.some((p) => permissions.has(p)),
    })),
  }));
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const allowed = sections.reduce((n, s) => n + s.items.filter((i) => i.allowed).length, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-sunken px-4 py-3 text-sm">
        <span className="font-semibold text-text">{allowed}</span>
        <span className="text-text-muted"> of {total} navigation areas visible to this role.</span>
        <p className="mt-1 text-[11px] text-text-faint">Simulated from the role's permissions — exactly what a user with only this role would see in the sidebar.</p>
      </div>
      {sections.map((s, i) => (
        <div key={s.title ?? i}>
          {s.title && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">{s.title}</p>}
          <div className="grid grid-cols-2 gap-1.5">
            {s.items.map((it) => (
              <div key={it.label} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm", it.allowed ? "border-primary/25 bg-primary/5 text-text" : "border-border text-text-faint line-through")}>
                <it.icon className={cn("size-3.5 shrink-0", it.allowed ? "text-primary dark:text-chart-3" : "text-text-faint")} />
                <span className="truncate">{it.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── permission matrix ─────────────────────────── */
function PermissionsTab({
  role, catalog, canManage,
}: { role: Role; catalog: PermissionCatalog | undefined; canManage: boolean }) {
  const [draft, setDraft] = React.useState<Set<string> | null>(null);
  const [permSearch, setPermSearch] = React.useState("");
  const save = useSetRolePermissions();

  React.useEffect(() => { setDraft(null); }, [role.id]);

  const effective = draft ?? new Set(role.permissions);
  const dirty = draft !== null && (draft.size !== role.permissions.length || role.permissions.some((p) => !draft.has(p)));

  const filtered: PermissionCatalog = Object.fromEntries(
    Object.entries(catalog ?? {})
      .map(([m, perms]) => [m, perms.filter((p) => !permSearch || p.code.includes(permSearch.toLowerCase()) || m.includes(permSearch.toLowerCase()))])
      .filter(([, perms]) => (perms as unknown[]).length > 0)
  );
  const totalPerms = Object.values(catalog ?? {}).reduce((n, p) => n + p.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-faint" aria-hidden />
          <Input value={permSearch} onChange={(e) => setPermSearch(e.target.value)} placeholder="Search permissions…" className="pl-8" aria-label="Search permissions" />
        </div>
        {canManage && (
          <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ id: role.id, permissionCodes: [...effective] }, { onSuccess: () => setDraft(null) })}>
            <Save /> Save
          </Button>
        )}
      </div>
      <p className="text-[11px] text-text-faint">{effective.size} of {totalPerms} permissions granted{role.isSystem ? " · system role" : ""}.</p>
      <div className="space-y-5">
        {Object.entries(filtered).map(([module, perms]) => {
          const allOn = perms.every((p) => effective.has(p.code));
          return (
            <section key={module}>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{module}</h4>
                {canManage && (
                  <button
                    className="text-[11px] text-primary hover:underline dark:text-chart-3 cursor-pointer"
                    onClick={() => { const next = new Set(effective); for (const p of perms) allOn ? next.delete(p.code) : next.add(p.code); setDraft(next); }}
                  >
                    {allOn ? "Clear all" : "Select all"}
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {perms.map((perm) => {
                  const active = effective.has(perm.code);
                  return (
                    <div key={perm.code} className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors", active ? "border-primary/30 bg-primary/5" : "border-border")}>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-text capitalize">{perm.action.replace(/_/g, " ")}</span>
                        <span className="block text-[11px] text-text-faint font-mono truncate">{perm.code}</span>
                      </span>
                      <button
                        role="switch"
                        aria-checked={active}
                        disabled={!canManage}
                        onClick={() => { const next = new Set(effective); active ? next.delete(perm.code) : next.add(perm.code); setDraft(next); }}
                        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer disabled:cursor-default", active ? "bg-primary" : "bg-border-strong")}
                      >
                        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", active ? "left-[18px]" : "left-0.5")} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── page ─────────────────────────── */
export function RolesPage() {
  const { can } = usePermissions();
  const canManage = can("roles:manage");
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const del = useDeleteRole();

  const [openRoleId, setOpenRoleId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<{ mode: "create" | "edit" | "clone"; role: Role | null } | null>(null);

  const openRole = roles.data?.find((r) => r.id === openRoleId) ?? null;
  const totalPerms = Object.values(catalog.data ?? {}).reduce((n, p) => n + p.length, 0);
  const totalUsers = (roles.data ?? []).reduce((n, r) => n + r.userCount, 0);
  const systemCount = (roles.data ?? []).filter((r) => r.isSystem).length;
  const customCount = (roles.data ?? []).length - systemCount;

  if (roles.isError) return <ErrorState message={apiErrorMessage(roles.error)} onRetry={() => roles.refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Roles & Permissions</h1>
          <p className="text-sm text-text-muted">Database-driven access control. Changes apply across the platform instantly.</p>
        </div>
        {canManage && <Button onClick={() => setForm({ mode: "create", role: null })}><Plus /> New Role</Button>}
      </div>

      {/* summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Roles", value: roles.data?.length ?? 0, accent: "text-primary", icon: ShieldCheck },
          { label: "System Roles", value: systemCount, accent: "text-info", icon: Lock },
          { label: "Custom Roles", value: customCount, accent: "text-success", icon: KeyRound },
          { label: "Total Users", value: totalUsers, accent: "text-(--chart-6)", icon: Users },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-4 flex items-center gap-3">
            <div className={cn("rounded-lg p-2.5 bg-surface-sunken", s.accent)}><s.icon className="size-5" /></div>
            <div>
              <p className={cn("text-xl font-semibold tabular-nums", s.accent)}>{s.value}</p>
              <p className="text-[11px] uppercase tracking-wide text-text-muted">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* roles table */}
      {roles.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !(roles.data ?? []).length ? (
        <EmptyState icon={ShieldCheck} title="No roles yet" description="Create your first role to start managing access." />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold text-center">Permissions</th>
                <th className="px-4 py-3 font-semibold text-center">Users</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(roles.data ?? []).map((role) => (
                <tr key={role.id} className="border-t border-border hover:bg-surface-sunken/40 cursor-pointer" onClick={() => setOpenRoleId(role.id)}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-text">{role.displayName}</p>
                      <p className="text-[11px] text-text-muted line-clamp-1">{role.description}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3"><code className="text-xs font-mono text-text-faint bg-surface-sunken px-1.5 py-0.5 rounded">{role.name}</code></td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-text tabular-nums font-medium">
                      <KeyRound className="size-3.5 text-text-faint" /> {role.permissions.length}<span className="text-text-faint font-normal">/{totalPerms}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums font-medium">{role.userCount}</td>
                  <td className="px-4 py-3">
                    <Badge variant={role.isSystem ? "info" : "success"}>{role.isSystem ? "System" : "Custom"}</Badge>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {canManage && (
                      <div className="flex gap-1">
                        <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setForm({ mode: "edit", role })}><Pencil className="size-3.5" /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Clone" onClick={() => setForm({ mode: "clone", role })}><Copy className="size-3.5" /></Button>
                        <Button
                          size="icon-sm" variant="ghost" aria-label="Delete"
                          disabled={role.isSystem || role.userCount > 0 || del.isPending}
                          title={role.isSystem ? "System roles can't be deleted" : role.userCount > 0 ? "Reassign users first" : undefined}
                          onClick={() => { if (window.confirm(`Delete role "${role.displayName}"?`)) del.mutate({ id: role.id }); }}
                        >
                          <Trash2 className="size-3.5 text-danger" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* role detail drawer */}
      <Sheet open={Boolean(openRole)} onOpenChange={(open) => !open && setOpenRoleId(null)}>
        <SheetContent className="max-w-xl">
          {openRole && (
            <>
              <SheetHeader className="pr-10">
                <div className="flex items-center gap-2">
                  <SheetTitle>{openRole.displayName}</SheetTitle>
                  {openRole.isSystem && <Badge variant="info" className="text-[10px]"><Lock className="size-3" /> System</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-text-muted font-mono">{openRole.name}</p>
                {openRole.description && <p className="mt-1 text-sm text-text-muted">{openRole.description}</p>}
              </SheetHeader>
              <SheetBody>
                <Tabs defaultValue="permissions">
                  <TabsList>
                    <TabsTrigger value="permissions"><KeyRound className="size-3.5" /> Permissions ({openRole.permissions.length})</TabsTrigger>
                    <TabsTrigger value="members"><Users className="size-3.5" /> Members ({openRole.userCount})</TabsTrigger>
                    <TabsTrigger value="preview"><ShieldCheck className="size-3.5" /> Preview</TabsTrigger>
                  </TabsList>
                  <TabsContent value="permissions" className="mt-4">
                    <PermissionsTab role={openRole} catalog={catalog.data} canManage={canManage} />
                  </TabsContent>
                  <TabsContent value="members" className="mt-4">
                    <MembersTab role={openRole} />
                  </TabsContent>
                  <TabsContent value="preview" className="mt-4">
                    <PreviewTab permissions={new Set(openRole.permissions)} />
                  </TabsContent>
                </Tabs>
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>

      <RoleFormDialog mode={form?.mode ?? "create"} role={form?.role ?? null} open={Boolean(form)} onClose={() => setForm(null)} />
    </div>
  );
}
