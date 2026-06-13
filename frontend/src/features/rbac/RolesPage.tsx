import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { KeyRound, Lock, Save, Search, ShieldCheck, Users } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}
type PermissionCatalog = Record<string, Array<{ id: string; code: string; action: string; description: string | null }>>;

/** Brand-palette accents for role cards (navy / light blue / slate cycle). */
const CARD_ACCENTS = [
  "from-primary to-(--chart-2)",
  "from-(--chart-2) to-(--chart-3)",
  "from-secondary to-primary",
];

export function RolesPage() {
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [openRoleId, setOpenRoleId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Set<string> | null>(null);
  const [permSearch, setPermSearch] = React.useState("");

  const roles = useQuery({
    queryKey: ["rbac", "roles"],
    queryFn: async () => (await api.get<{ data: Role[] }>("/rbac/roles")).data.data,
  });
  const catalog = useQuery({
    queryKey: ["rbac", "permissions"],
    queryFn: async () => (await api.get<{ data: PermissionCatalog }>("/rbac/permissions")).data.data,
  });

  const openRole = roles.data?.find((r) => r.id === openRoleId) ?? null;
  const effective = draft ?? new Set(openRole?.permissions ?? []);
  const dirty =
    draft !== null &&
    openRole !== null &&
    (draft.size !== openRole.permissions.length || openRole.permissions.some((p) => !draft.has(p)));

  const save = useMutation({
    mutationFn: async () => api.put(`/rbac/roles/${openRole!.id}/permissions`, { permissionCodes: [...effective] }),
    onSuccess: () => {
      toast.success(`Permissions updated for ${openRole?.displayName}.`);
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["rbac"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  if (roles.isError) return <ErrorState message={apiErrorMessage(roles.error)} onRetry={() => roles.refetch()} />;

  const canManage = can("roles:manage");
  const filteredCatalog: PermissionCatalog = Object.fromEntries(
    Object.entries(catalog.data ?? {})
      .map(([module, perms]) => [
        module,
        perms.filter(
          (p) =>
            !permSearch ||
            p.code.includes(permSearch.toLowerCase()) ||
            module.includes(permSearch.toLowerCase())
        ),
      ])
      .filter(([, perms]) => (perms as unknown[]).length > 0)
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Roles & Permissions</h1>
        <p className="text-sm text-text-muted">
          Access is database-driven — changes apply across the platform instantly.
        </p>
      </div>

      {roles.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {(roles.data ?? []).map((role, i) => (
            <motion.button
              key={role.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
              onClick={() => {
                setOpenRoleId(role.id);
                setDraft(null);
                setPermSearch("");
              }}
              className="group relative overflow-hidden rounded-xl border border-border bg-surface text-left shadow-card hover:shadow-raised transition-shadow cursor-pointer"
            >
              <div className={cn("h-1.5 bg-gradient-to-r", CARD_ACCENTS[i % CARD_ACCENTS.length])} aria-hidden />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="rounded-lg bg-primary/10 p-2.5 text-primary dark:text-chart-3">
                    <ShieldCheck className="size-5" />
                  </div>
                  {role.isSystem && (
                    <Badge className="text-[10px]">
                      <Lock className="size-3" /> System
                    </Badge>
                  )}
                </div>
                <h3 className="mt-3 font-semibold text-text group-hover:text-primary dark:group-hover:text-chart-3 transition-colors">
                  {role.displayName}
                </h3>
                <p className="mt-0.5 text-xs text-text-muted line-clamp-2 min-h-8">{role.description}</p>
                <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <KeyRound className="size-3.5 text-text-faint" />
                    <strong className="text-text tabular-nums">{role.permissions.length}</strong> permissions
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5 text-text-faint" />
                    <strong className="text-text tabular-nums">{role.userCount}</strong> users
                  </span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* permission drawer */}
      <Sheet open={Boolean(openRole)} onOpenChange={(open) => !open && setOpenRoleId(null)}>
        <SheetContent className="max-w-xl">
          {openRole && (
            <>
              <SheetHeader className="pr-10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <SheetTitle>{openRole.displayName}</SheetTitle>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {effective.size} of{" "}
                      {Object.values(catalog.data ?? {}).reduce((n, p) => n + p.length, 0)} permissions ·{" "}
                      {openRole.userCount} users
                    </p>
                  </div>
                  {canManage && (
                    <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
                      <Save /> Save
                    </Button>
                  )}
                </div>
                <div className="relative mt-3">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-faint" aria-hidden />
                  <Input
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    placeholder="Search permissions…"
                    className="pl-8"
                    aria-label="Search permissions"
                  />
                </div>
              </SheetHeader>
              <SheetBody className="space-y-5">
                {Object.entries(filteredCatalog).map(([module, perms]) => {
                  const allOn = perms.every((p) => effective.has(p.code));
                  return (
                    <section key={module}>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{module}</h4>
                        {canManage && (
                          <button
                            className="text-[11px] text-primary hover:underline dark:text-chart-3 cursor-pointer"
                            onClick={() => {
                              const next = new Set(effective);
                              for (const p of perms) allOn ? next.delete(p.code) : next.add(p.code);
                              setDraft(next);
                            }}
                          >
                            {allOn ? "Clear all" : "Select all"}
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {perms.map((perm) => {
                          const active = effective.has(perm.code);
                          return (
                            <label
                              key={perm.code}
                              className={cn(
                                "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors",
                                active ? "border-primary/30 bg-primary/5" : "border-border",
                                canManage ? "cursor-pointer hover:bg-surface-sunken" : "opacity-80"
                              )}
                            >
                              <span>
                                <span className="block text-sm font-medium text-text capitalize">
                                  {perm.action.replace(/_/g, " ")}
                                </span>
                                <span className="block text-[11px] text-text-faint font-mono">{perm.code}</span>
                              </span>
                              {/* toggle */}
                              <button
                                role="switch"
                                aria-checked={active}
                                disabled={!canManage}
                                onClick={() => {
                                  const next = new Set(effective);
                                  active ? next.delete(perm.code) : next.add(perm.code);
                                  setDraft(next);
                                }}
                                className={cn(
                                  "relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer disabled:cursor-default",
                                  active ? "bg-primary" : "bg-border-strong"
                                )}
                              >
                                <span
                                  className={cn(
                                    "absolute top-0.5 size-4 rounded-full bg-white shadow transition-all",
                                    active ? "left-[18px]" : "left-0.5"
                                  )}
                                />
                              </button>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
