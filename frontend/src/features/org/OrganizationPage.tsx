import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Briefcase, Building2, MapPin, Pencil, Plus, Trash2, TrendingUp, UserRound, Users } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { initials, cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";

const DeptSchema = z.object({
  name: z.string().min(2, "Required"),
  code: z.string().min(2).max(20).regex(/^[A-Z0-9_-]+$/, "UPPERCASE letters/digits only"),
});
const DesigSchema = z.object({
  title: z.string().min(2, "Required"),
  level: z.number().int().min(1).max(20),
});
const LocSchema = z.object({
  name: z.string().min(2, "Required"),
  city: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
});

function useOrgList<T>(key: string, url: string) {
  return useQuery({ queryKey: ["org", key], queryFn: async () => (await api.get<{ data: T[] }>(url)).data.data });
}

function orgInvalidate(queryClient: ReturnType<typeof useQueryClient>, key: string) {
  void queryClient.invalidateQueries({ queryKey: ["org", key] });
  void queryClient.invalidateQueries({ queryKey: ["analytics"] });
  void queryClient.invalidateQueries({ queryKey: ["org-explorer"] });
}
function useCreate(url: string, key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post(url, input),
    onSuccess: () => { toast.success("Created."); orgInvalidate(queryClient, key); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
function useUpdate(url: string, key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string } & Record<string, unknown>) => { const { id, ...body } = input; return api.patch(`${url}/${id}`, body); },
    onSuccess: () => { toast.success("Updated."); orgInvalidate(queryClient, key); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
function useDelete(url: string, key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${url}/${id}`),
    onSuccess: () => { toast.success("Deleted."); orgInvalidate(queryClient, key); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

/** Compact edit/delete actions for an org card. */
function CardActions({ onEdit, onDelete, deleting, label }: { onEdit: () => void; onDelete: () => void; deleting?: boolean; label: string }) {
  return (
    <div className="flex gap-1 shrink-0">
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${label}`} onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil className="size-3.5" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${label}`} loading={deleting} onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${label}"? This cannot be undone.`)) onDelete(); }}><Trash2 className="size-3.5 text-danger" /></Button>
    </div>
  );
}

const DEPT_ACCENTS = [
  "from-primary to-(--chart-2)",
  "from-(--chart-2) to-(--chart-3)",
  "from-secondary to-primary",
  "from-(--chart-3) to-(--chart-2)",
];

export function OrganizationPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Organization</h1>
        <p className="text-sm text-text-muted">
          The structure that powers every dropdown, approval chain and report in Somvanshi HRMS.
        </p>
      </div>
      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments"><Building2 /> Departments</TabsTrigger>
          <TabsTrigger value="designations"><Briefcase /> Designations</TabsTrigger>
          <TabsTrigger value="locations"><MapPin /> Locations</TabsTrigger>
        </TabsList>
        <TabsContent value="departments"><DepartmentsTab /></TabsContent>
        <TabsContent value="designations"><DesignationsTab /></TabsContent>
        <TabsContent value="locations"><LocationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function DepartmentsTab() {
  interface Dept {
    id: string;
    name: string;
    code: string;
    head: { id: string; firstName: string; lastName: string; photoUrl: string | null } | null;
    _count: { employees: number; children: number };
  }
  interface DeptStats { id: string; newThisMonth: number; fullTime: number; interns: number }

  const list = useOrgList<Dept>("departments", "/org/departments");
  const stats = useQuery({
    queryKey: ["analytics", "department"],
    queryFn: async () => (await api.get<{ data: DeptStats[] }>("/analytics/department")).data.data,
  });
  const statById = new Map((stats.data ?? []).map((s) => [s.id, s]));

  const create = useCreate("/org/departments", "departments");
  const update = useUpdate("/org/departments", "departments");
  const del = useDelete("/org/departments", "departments");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Dept | null>(null);
  const form = useForm<z.infer<typeof DeptSchema>>({ resolver: zodResolver(DeptSchema) });
  const dialogOpen = open || Boolean(editing);
  const closeDialog = () => { setOpen(false); setEditing(null); form.reset({ name: "", code: "" }); };
  const startEdit = (d: Dept) => { setEditing(d); form.reset({ name: d.name, code: d.code }); };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus /> New Department</Button>
      </div>

      {list.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : list.isError ? (
        <ErrorState message={apiErrorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : !list.data?.length ? (
        <EmptyState icon={Building2} title="No departments yet" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.data.map((dept, i) => {
            const stat = statById.get(dept.id);
            return (
              <motion.div
                key={dept.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
              >
                <Card className="overflow-hidden rounded-xl hover:shadow-raised transition-shadow h-full">
                  <div className={cn("h-1.5 bg-gradient-to-r", DEPT_ACCENTS[i % DEPT_ACCENTS.length])} aria-hidden />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-text">{dept.name}</h3>
                        <Badge className="mt-1 font-mono text-[10px]">{dept.code}</Badge>
                      </div>
                      <CardActions label={dept.name} onEdit={() => startEdit(dept)} onDelete={() => del.mutate(dept.id)} deleting={del.isPending} />
                    </div>

                    <div className="mt-4 flex items-center gap-2.5 border-t border-border pt-3.5">
                      {dept.head ? (
                        <>
                          <Avatar size="sm">
                            <AvatarFallback>{initials(dept.head.firstName, dept.head.lastName)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-text truncate">
                              {dept.head.firstName} {dept.head.lastName}
                            </p>
                            <p className="text-[11px] text-text-muted">Department Head</p>
                          </div>
                        </>
                      ) : (
                        <p className="flex items-center gap-2 text-xs text-text-faint">
                          <UserRound className="size-4" /> No head assigned
                        </p>
                      )}
                    </div>

                    <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-surface-sunken px-2 py-2">
                        <p className="text-base font-semibold text-text tabular-nums">{dept._count.employees}</p>
                        <p className="text-[10px] uppercase tracking-wide text-text-muted">People</p>
                      </div>
                      <div className="rounded-lg bg-surface-sunken px-2 py-2">
                        <p className="text-base font-semibold text-success tabular-nums">
                          {stat ? `+${stat.newThisMonth}` : "—"}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-text-muted">This month</p>
                      </div>
                      <div className="rounded-lg bg-surface-sunken px-2 py-2">
                        <p className="text-base font-semibold text-text tabular-nums">{stat?.interns ?? "—"}</p>
                        <p className="text-[10px] uppercase tracking-wide text-text-muted">Interns</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit department" : "New department"}</DialogTitle></DialogHeader>
          <form
            onSubmit={form.handleSubmit(async (v) => {
              if (editing) await update.mutateAsync({ id: editing.id, name: v.name });
              else await create.mutateAsync(v);
              closeDialog();
            })}
            className="space-y-4"
            noValidate
          >
            <FormField label="Name" htmlFor="d-name" required error={form.formState.errors.name?.message}>
              <Input id="d-name" {...form.register("name")} />
            </FormField>
            <FormField label="Code" htmlFor="d-code" required error={form.formState.errors.code?.message} hint={editing ? "Code can't be changed" : "e.g. ENG, HR, FIN"}>
              <Input id="d-code" disabled={Boolean(editing)} {...form.register("code")} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" loading={create.isPending || update.isPending}>{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DesignationsTab() {
  interface Desig { id: string; title: string; level: number; band: { name: string } | null; _count: { employees: number } }
  const list = useOrgList<Desig>("designations", "/org/designations");
  const create = useCreate("/org/designations", "designations");
  const update = useUpdate("/org/designations", "designations");
  const del = useDelete("/org/designations", "designations");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Desig | null>(null);
  const form = useForm<z.infer<typeof DesigSchema>>({ resolver: zodResolver(DesigSchema), defaultValues: { level: 1 } });
  const dialogOpen = open || Boolean(editing);
  const closeDialog = () => { setOpen(false); setEditing(null); form.reset({ title: "", level: 1 }); };
  const startEdit = (d: Desig) => { setEditing(d); form.reset({ title: d.title, level: d.level }); };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus /> New Designation</Button>
      </div>
      {list.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : list.isError ? (
        <ErrorState message={apiErrorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : !list.data?.length ? (
        <EmptyState icon={Briefcase} title="No designations" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.data.map((d) => (
            <Card key={d.id} className="rounded-xl p-4 flex items-center justify-between gap-2 hover:shadow-raised transition-shadow">
              <div className="min-w-0">
                <p className="font-medium text-text truncate">{d.title}</p>
                <p className="text-xs text-text-muted">
                  Level {d.level}
                  {d.band ? ` · Band ${d.band.name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="primary"><Users className="size-3" /> {d._count.employees}</Badge>
                <CardActions label={d.title} onEdit={() => startEdit(d)} onDelete={() => del.mutate(d.id)} deleting={del.isPending} />
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit designation" : "New designation"}</DialogTitle></DialogHeader>
          <form
            onSubmit={form.handleSubmit(async (v) => {
              if (editing) await update.mutateAsync({ id: editing.id, ...v });
              else await create.mutateAsync(v);
              closeDialog();
            })}
            className="space-y-4"
            noValidate
          >
            <FormField label="Title" htmlFor="g-title" required error={form.formState.errors.title?.message}>
              <Input id="g-title" {...form.register("title")} />
            </FormField>
            <FormField label="Level" htmlFor="g-level" required error={form.formState.errors.level?.message} hint="1 = junior, higher = senior">
              <Input id="g-level" type="number" min={1} max={20} {...form.register("level", { valueAsNumber: true })} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" loading={create.isPending || update.isPending}>{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LocationsTab() {
  interface Loc { id: string; name: string; city: string | null; country: string | null; _count: { employees: number } }
  const list = useOrgList<Loc>("locations", "/org/locations");
  const create = useCreate("/org/locations", "locations");
  const update = useUpdate("/org/locations", "locations");
  const del = useDelete("/org/locations", "locations");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Loc | null>(null);
  const form = useForm<z.infer<typeof LocSchema>>({ resolver: zodResolver(LocSchema) });
  const dialogOpen = open || Boolean(editing);
  const closeDialog = () => { setOpen(false); setEditing(null); form.reset({ name: "", city: "", country: "" }); };
  const startEdit = (l: Loc) => { setEditing(l); form.reset({ name: l.name, city: l.city ?? "", country: l.country ?? "" }); };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus /> New Location</Button>
      </div>
      {list.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : list.isError ? (
        <ErrorState message={apiErrorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : !list.data?.length ? (
        <EmptyState icon={MapPin} title="No locations" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.data.map((l) => (
            <Card key={l.id} className="rounded-xl p-4 hover:shadow-raised transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-lg bg-info-bg p-2 text-info">
                  <MapPin className="size-4" />
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="primary"><Users className="size-3" /> {l._count.employees}</Badge>
                  <CardActions label={l.name} onEdit={() => startEdit(l)} onDelete={() => del.mutate(l.id)} deleting={del.isPending} />
                </div>
              </div>
              <p className="mt-2.5 font-medium text-text">{l.name}</p>
              <p className="text-xs text-text-muted">{[l.city, l.country].filter(Boolean).join(", ") || "—"}</p>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit location" : "New location"}</DialogTitle></DialogHeader>
          <form
            onSubmit={form.handleSubmit(async (v) => {
              const body = { ...v, city: v.city || null, country: v.country || null };
              if (editing) await update.mutateAsync({ id: editing.id, ...body });
              else await create.mutateAsync(body);
              closeDialog();
            })}
            className="space-y-4"
            noValidate
          >
            <FormField label="Name" htmlFor="l-name" required error={form.formState.errors.name?.message}>
              <Input id="l-name" {...form.register("name")} />
            </FormField>
            <FormField label="City" htmlFor="l-city" error={form.formState.errors.city?.message}>
              <Input id="l-city" {...form.register("city")} />
            </FormField>
            <FormField label="Country" htmlFor="l-country" error={form.formState.errors.country?.message}>
              <Input id="l-country" {...form.register("country")} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" loading={create.isPending || update.isPending}>{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { TrendingUp };
