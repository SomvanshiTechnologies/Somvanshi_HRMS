import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, BadgeCheck, CalendarClock, CheckCircle2, Download, FileWarning,
  IdCard, Landmark, Plus, Search, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import {
  TASK_TYPES, useComplianceSummary, useComplianceTasks, useCreateTask, useDirectory,
  useDocExpiry, useGenerateTasks, useMyStatutory, useRegisters, useSaveMyStatutory,
  useUpdateEmployeeStatutory, useUpdateTask, type ComplianceTask, type DirectoryRow,
} from "./useCompliance";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { cn, formatDate, formatINR, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";

const inr = (v: string | number) => formatINR(Number(v));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const now = new Date();

/* ─────────────────────────── self-service ─────────────────────────── */
function MyStatutory() {
  const me = useMyStatutory();
  const save = useSaveMyStatutory();
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [prefs, setPrefs] = React.useState({ taxRegime: "NEW", pfOptedIn: true, esiApplicable: false });
  const s = me.data;

  React.useEffect(() => {
    if (s) setPrefs({ taxRegime: s.taxRegime, pfOptedIn: s.pfOptedIn, esiApplicable: s.esiApplicable });
  }, [s]);

  if (me.isLoading) return <Skeleton className="h-72 rounded-xl" />;

  const field = (key: string) => form[key] ?? "";
  return (
    <Card className="rounded-xl p-5 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text flex items-center gap-2"><IdCard className="size-4 text-primary dark:text-chart-3" /> My Statutory Details</h3>
        {s?.verifiedAt ? <Badge variant="success"><BadgeCheck className="size-3" /> Verified</Badge> : s ? <Badge variant="warning">Pending verification</Badge> : <Badge variant="default">Not submitted</Badge>}
      </div>
      <p className="text-xs text-text-muted">These are confidential and used for PF, ESI and tax filings. Editing resets HR verification.</p>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Aadhaar number" hint={s?.aadhaarNumber ? `On file: ${s.aadhaarNumber}` : "12 digits"}><Input inputMode="numeric" maxLength={12} value={field("aadhaarNumber")} onChange={(e) => setForm({ ...form, aadhaarNumber: e.target.value.replace(/\D/g, "") })} placeholder="Enter to update" /></FormField>
        <FormField label="PAN" hint={s?.panNumber ? `On file: ${s.panNumber}` : "ABCDE1234F"}><Input maxLength={10} value={field("panNumber")} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} placeholder="Enter to update" /></FormField>
        <FormField label="UAN (PF)" hint={s?.uanNumber ? `On file: ${s.uanNumber}` : "12 digits"}><Input inputMode="numeric" maxLength={12} value={field("uanNumber")} onChange={(e) => setForm({ ...form, uanNumber: e.target.value.replace(/\D/g, "") })} placeholder="Enter to update" /></FormField>
        <FormField label="ESIC number" hint={s?.esicNumber ? `On file: ${s.esicNumber}` : ""}><Input value={field("esicNumber")} onChange={(e) => setForm({ ...form, esicNumber: e.target.value })} placeholder="Enter to update" /></FormField>
        <FormField label="Tax regime">
          <Select value={prefs.taxRegime} onValueChange={(v) => setPrefs({ ...prefs, taxRegime: v })}>
            <SelectTrigger aria-label="Tax regime"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="NEW">New regime</SelectItem><SelectItem value="OLD">Old regime</SelectItem></SelectContent>
          </Select>
        </FormField>
        <div className="flex items-end gap-4 pb-1">
          <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" checked={prefs.pfOptedIn} onChange={(e) => setPrefs({ ...prefs, pfOptedIn: e.target.checked })} /> PF opted-in</label>
        </div>
      </div>
      <Button
        loading={save.isPending}
        onClick={async () => {
          const payload: Record<string, unknown> = { ...prefs };
          for (const k of ["aadhaarNumber", "panNumber", "uanNumber", "esicNumber"]) if (form[k]) payload[k] = form[k];
          await save.mutateAsync(payload);
          setForm({});
        }}
      >
        Save details
      </Button>
    </Card>
  );
}

/* ─────────────────────────── overview ─────────────────────────── */
function OverviewTab() {
  const summary = useComplianceSummary(true);
  const d = summary.data;
  const cards = [
    { label: "Statutory completion", value: d ? `${d.completionPct}%` : undefined, sub: d ? `${d.statutoryComplete}/${d.activeEmployees} employees` : "", icon: ShieldCheck, accent: "text-primary dark:text-chart-3" },
    { label: "Verified records", value: d?.verified, sub: "Aadhaar + PAN verified", icon: BadgeCheck, accent: "text-success" },
    { label: "Pending details", value: d?.statutoryPending, sub: "Missing Aadhaar/PAN", icon: AlertTriangle, accent: "text-warning" },
    { label: "Overdue filings", value: d?.overdueFilings, sub: "Past due date", icon: FileWarning, accent: "text-danger" },
    { label: "Filings due soon", value: d?.filingsDueSoon, sub: "Next 15 days", icon: CalendarClock, accent: "text-info" },
    { label: "Documents expiring", value: d?.documentsExpiring, sub: "Next 90 days", icon: FileWarning, accent: "text-warning" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="rounded-xl p-4 flex items-center gap-3.5">
          <div className={cn("rounded-lg bg-surface-sunken p-2.5", c.accent)}><c.icon className="size-5" /></div>
          <div>
            <p className={cn("text-xl font-semibold tabular-nums", c.accent)}>{summary.isLoading ? <Skeleton className="h-7 w-12" /> : c.value ?? 0}</p>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">{c.label}</p>
            <p className="text-[11px] text-text-faint">{c.sub}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ─────────────────────────── directory ─────────────────────────── */
function EditDialog({ row, onClose }: { row: DirectoryRow | null; onClose: () => void }) {
  const update = useUpdateEmployeeStatutory();
  const [form, setForm] = React.useState<Record<string, string>>({});
  React.useEffect(() => { setForm({}); }, [row]);
  if (!row) return null;
  const s = row.statutory;
  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row.firstName} {row.lastName} · Statutory</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Aadhaar" hint={s?.aadhaarNumber ?? "—"}><Input maxLength={12} value={form["aadhaarNumber"] ?? ""} onChange={(e) => setForm({ ...form, aadhaarNumber: e.target.value.replace(/\D/g, "") })} placeholder="Update" /></FormField>
          <FormField label="PAN" hint={s?.panNumber ?? "—"}><Input maxLength={10} value={form["panNumber"] ?? ""} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} placeholder="Update" /></FormField>
          <FormField label="UAN" hint={s?.uanNumber ?? "—"}><Input maxLength={12} value={form["uanNumber"] ?? ""} onChange={(e) => setForm({ ...form, uanNumber: e.target.value.replace(/\D/g, "") })} placeholder="Update" /></FormField>
          <FormField label="ESIC" hint={s?.esicNumber ?? "—"}><Input value={form["esicNumber"] ?? ""} onChange={(e) => setForm({ ...form, esicNumber: e.target.value })} placeholder="Update" /></FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {row.complete && !row.verified && (
            <Button variant="success" loading={update.isPending} onClick={async () => { await update.mutateAsync({ id: row.id, ...form, verify: true }); onClose(); }}>
              <BadgeCheck /> Save &amp; verify
            </Button>
          )}
          <Button loading={update.isPending} onClick={async () => { await update.mutateAsync({ id: row.id, ...form }); onClose(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DirectoryTab() {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const dir = useDirectory({ search: search || undefined, filter: filter === "all" ? undefined : filter });
  const [editing, setEditing] = React.useState<DirectoryRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-faint" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or code…" className="pl-8" aria-label="Search" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44 h-9" aria-label="Filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            <SelectItem value="incomplete">Missing details</SelectItem>
            <SelectItem value="unverified">Awaiting verification</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {dir.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : dir.isError ? (
        <ErrorState message={apiErrorMessage(dir.error)} onRetry={() => dir.refetch()} />
      ) : !dir.data?.length ? (
        <EmptyState icon={Users} title="No employees" description="No records match this filter." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {dir.data.map((row, i) => (
            <motion.div key={row.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}>
              <Card className="rounded-xl p-4 hover:shadow-raised transition-shadow cursor-pointer" onClick={() => setEditing(row)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar size="sm">{row.photoUrl && <AvatarImage src={row.photoUrl} alt="" />}<AvatarFallback>{initials(row.firstName, row.lastName)}</AvatarFallback></Avatar>
                    <div className="min-w-0"><p className="font-semibold text-text truncate">{row.firstName} {row.lastName}</p><p className="text-xs text-text-muted truncate">{row.designation ?? row.employeeCode}</p></div>
                  </div>
                  {row.verified ? <Badge variant="success"><BadgeCheck className="size-3" /></Badge> : row.complete ? <Badge variant="warning">unverified</Badge> : <Badge variant="danger">incomplete</Badge>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
                  <div><span className="text-text-faint">Aadhaar</span><p className="text-text font-mono">{row.statutory?.aadhaarNumber ?? "—"}</p></div>
                  <div><span className="text-text-faint">PAN</span><p className="text-text font-mono">{row.statutory?.panNumber ?? "—"}</p></div>
                  <div><span className="text-text-faint">UAN</span><p className="text-text font-mono">{row.statutory?.uanNumber ?? "—"}</p></div>
                  <div><span className="text-text-faint">ESIC</span><p className="text-text font-mono">{row.statutory?.esicNumber ?? "—"}</p></div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
      <EditDialog row={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/* ─────────────────────────── registers ─────────────────────────── */
function RegistersTab() {
  const [month, setMonth] = React.useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [year, setYear] = React.useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const reg = useRegisters(month, year);
  const d = reg.data;

  const exportCsv = () => {
    if (!d?.rows.length) return;
    const head = ["Code", "Name", "UAN", "ESIC", "PAN", "Gross", "PF", "PT", "ESI", "TDS"];
    const lines = d.rows.map((r) => [r.employeeCode, r.name, r.uan ?? "", r.esic ?? "", r.pan ?? "", r.gross, r.pf, r.pt, r.esi, r.tds].join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `statutory-register-${MONTHS[month - 1]}-${year}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-32 h-9" aria-label="Month"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28 h-9" aria-label="Year"><SelectValue /></SelectTrigger>
          <SelectContent>{[0, 1, 2].map((o) => { const y = now.getFullYear() - o; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}</SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!d?.rows.length}><Download /> Export CSV</Button>
      </div>

      {/* totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[{ k: "pf", l: "Provident Fund" }, { k: "pt", l: "Professional Tax" }, { k: "esi", l: "ESI" }, { k: "tds", l: "TDS" }].map((t) => (
          <Card key={t.k} className="rounded-xl p-4">
            <p className="text-lg font-semibold text-text tabular-nums">{reg.isLoading ? <Skeleton className="h-6 w-16" /> : inr(d?.totals[t.k as "pf"] ?? 0)}</p>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">{t.l}</p>
          </Card>
        ))}
      </div>

      {reg.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : !d?.rows.length ? (
        <EmptyState icon={Landmark} title="No payroll for this period" description="Run and approve payroll for this month to populate the statutory register." />
      ) : (
        <Card className="rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-text-muted text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Employee</th>
                  <th className="text-left px-3 py-2 font-medium">UAN</th>
                  <th className="text-right px-3 py-2 font-medium">Gross</th>
                  <th className="text-right px-3 py-2 font-medium">PF</th>
                  <th className="text-right px-3 py-2 font-medium">PT</th>
                  <th className="text-right px-3 py-2 font-medium">ESI</th>
                  <th className="text-right px-3 py-2 font-medium">TDS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.rows.map((r) => (
                  <tr key={r.employeeId} className="hover:bg-surface-sunken/50">
                    <td className="px-3 py-2"><p className="text-text font-medium">{r.name}</p><p className="text-[11px] text-text-faint">{r.employeeCode}</p></td>
                    <td className="px-3 py-2 font-mono text-xs text-text-muted">{r.uan ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(r.gross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(r.pf)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(r.pt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(r.esi)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(r.tds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────── filing calendar ─────────────────────────── */
function TaskCard({ task }: { task: ComplianceTask }) {
  const update = useUpdateTask();
  const due = new Date(task.dueDate);
  return (
    <Card className="rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-text truncate">{task.title}</p>
          <p className="text-xs text-text-muted">{task.authority ?? task.type} · due {formatDate(due)}</p>
        </div>
        <Badge variant={statusVariant(task.status)}>{task.status.toLowerCase()}</Badge>
      </div>
      {task.amount && <p className="mt-2 text-sm text-text">Amount: <span className="font-semibold tabular-nums">{inr(task.amount)}</span></p>}
      {task.reference && <p className="text-xs text-text-faint">Ref: {task.reference}</p>}
      {(task.status === "PENDING" || task.status === "OVERDUE") && (
        <Button size="sm" className="mt-3 w-full" loading={update.isPending} onClick={() => update.mutate({ id: task.id, status: "FILED" })}>
          <CheckCircle2 /> Mark filed
        </Button>
      )}
      {task.status === "FILED" && task.filedAt && <p className="mt-2 text-xs text-success flex items-center gap-1"><CheckCircle2 className="size-3.5" /> Filed {formatDate(task.filedAt)}</p>}
    </Card>
  );
}

function AddTaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateTask();
  const [form, setForm] = React.useState({ type: "OTHER", title: "", authority: "", period: "", dueDate: "" });
  const reset = () => setForm({ type: "OTHER", title: "", authority: "", period: "", dueDate: "" });
  const valid = form.title.length >= 3 && form.period.length >= 2 && form.dueDate;
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add filing task</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type" required>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField label="Authority"><Input value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} placeholder="EPFO, ESIC…" /></FormField>
          <FormField label="Title" required className="col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
          <FormField label="Period" required hint="e.g. Jun 2026"><Input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} /></FormField>
          <FormField label="Due date" required><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          <Button disabled={!valid} loading={create.isPending} onClick={async () => { await create.mutateAsync({ ...form, authority: form.authority || undefined }); onOpenChange(false); reset(); }}>Add task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CalendarTab() {
  const tasks = useComplianceTasks();
  const generate = useGenerateTasks();
  const [addOpen, setAddOpen] = React.useState(false);
  const [genMonth, setGenMonth] = React.useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [genYear, setGenYear] = React.useState(now.getFullYear());

  const list = tasks.data ?? [];
  const overdue = list.filter((t) => t.status === "OVERDUE");
  const pending = list.filter((t) => t.status === "PENDING");
  const done = list.filter((t) => t.status === "FILED" || t.status === "WAIVED");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted">Generate monthly filings for</span>
        <Select value={String(genMonth)} onValueChange={(v) => setGenMonth(Number(v))}>
          <SelectTrigger className="w-28 h-9" aria-label="Month"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(genYear)} onValueChange={(v) => setGenYear(Number(v))}>
          <SelectTrigger className="w-24 h-9" aria-label="Year"><SelectValue /></SelectTrigger>
          <SelectContent>{[0, 1].map((o) => { const y = now.getFullYear() - o; return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}</SelectContent>
        </Select>
        <Button variant="secondary" size="sm" loading={generate.isPending} onClick={() => generate.mutate({ month: genMonth, year: genYear })}><Sparkles /> Auto-generate</Button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus /> Add task</Button>
      </div>

      {tasks.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : !list.length ? (
        <EmptyState icon={CalendarClock} title="No filing tasks" description="Auto-generate the standard PF/PT/ESI/TDS filings for a payroll month, or add one manually." />
      ) : (
        <div className="space-y-5">
          {[{ label: "Overdue", rows: overdue }, { label: "Upcoming", rows: pending }, { label: "Completed", rows: done }].filter((g) => g.rows.length).map((g) => (
            <div key={g.label}>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">{g.label} ({g.rows.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {g.rows.map((t) => <TaskCard key={t.id} task={t} />)}
              </div>
            </div>
          ))}
        </div>
      )}
      <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

/* ─────────────────────────── documents ─────────────────────────── */
function DocumentsTab() {
  const docs = useDocExpiry(true);
  if (docs.isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (!docs.data?.length) return <EmptyState icon={ShieldCheck} title="Nothing expiring" description="No employee documents expire within the next 90 days." />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {docs.data.map((d) => (
        <Card key={d.id} className="rounded-xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><p className="font-semibold text-text truncate">{d.name}</p><p className="text-xs text-text-muted">{d.category.replace(/_/g, " ")}</p></div>
            <Badge variant={d.expired ? "danger" : "warning"}>{d.expired ? "expired" : "expiring"}</Badge>
          </div>
          <p className="mt-2 text-sm text-text">{d.employee.firstName} {d.employee.lastName} <span className="text-text-faint">· {d.employee.employeeCode}</span></p>
          <p className="text-xs text-text-faint">{d.expired ? "Expired" : "Expires"} {formatDate(d.expiresOn)}</p>
        </Card>
      ))}
    </div>
  );
}

/* ─────────────────────────── page ─────────────────────────── */
export function CompliancePage() {
  const { can } = usePermissions();
  const isOfficer = can("compliance:read_all", "compliance:manage");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Compliance &amp; Statutory</h1>
        <p className="text-sm text-text-muted">Statutory identifiers, PF/PT/ESI/TDS registers, filing calendar and document retention.</p>
      </div>

      {isOfficer ? (
        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview"><ShieldCheck /> Overview</TabsTrigger>
            <TabsTrigger value="directory"><IdCard /> Statutory IDs</TabsTrigger>
            <TabsTrigger value="registers"><Landmark /> Registers</TabsTrigger>
            <TabsTrigger value="calendar"><CalendarClock /> Filing Calendar</TabsTrigger>
            <TabsTrigger value="documents"><FileWarning /> Documents</TabsTrigger>
            <TabsTrigger value="mine"><Users /> My Details</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="directory"><DirectoryTab /></TabsContent>
          <TabsContent value="registers"><RegistersTab /></TabsContent>
          <TabsContent value="calendar"><CalendarTab /></TabsContent>
          <TabsContent value="documents"><DocumentsTab /></TabsContent>
          <TabsContent value="mine"><MyStatutory /></TabsContent>
        </Tabs>
      ) : (
        <MyStatutory />
      )}
    </div>
  );
}
