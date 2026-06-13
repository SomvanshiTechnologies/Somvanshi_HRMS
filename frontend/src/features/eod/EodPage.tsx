import * as React from "react";
import {
  BarChart3, CalendarDays, CheckCircle2, ClipboardList, FolderKanban,
  ListChecks, Send, Users, AlertTriangle,
} from "lucide-react";
import {
  useEodByDate, useEodDashboard, useEodSummary, useMyEod, useProjectAnalytics,
  useReviewEod, useSaveEod, useTeamEod, type TeamRow,
} from "./useEod";
import { usePermissions } from "@/hooks/usePermissions";
import { cn, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());

/* ───────────── employee: today's EOD ───────────── */
const EMPTY = { project: "", tasksCompleted: "", workInProgress: "", blockers: "", comments: "" };
function TodayForm() {
  const [date, setDate] = React.useState(TODAY);
  const report = useEodByDate(date);
  const save = useSaveEod();
  const [form, setForm] = React.useState(EMPTY);

  React.useEffect(() => {
    const r = report.data;
    setForm(r ? { project: r.project ?? "", tasksCompleted: r.tasksCompleted, workInProgress: r.workInProgress ?? "", blockers: r.blockers ?? "", comments: r.comments ?? "" } : EMPTY);
  }, [report.data, date]);

  const reviewed = report.data?.status === "REVIEWED";
  const valid = form.tasksCompleted.trim().length >= 3;
  const payload = (submit: boolean) => ({ date, ...form, project: form.project || undefined, workInProgress: form.workInProgress || undefined, blockers: form.blockers || undefined, comments: form.comments || undefined, submit });

  if (report.isLoading) return <Skeleton className="h-96 rounded-xl" />;
  return (
    <Card className="rounded-xl p-5 max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-text flex items-center gap-2"><ClipboardList className="size-4 text-primary dark:text-chart-3" /> End-of-Day Report</h3>
        <div className="flex items-center gap-2">
          <Input type="date" max={TODAY} value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" aria-label="Date" />
          {report.data && <Badge variant={statusVariant(report.data.status)}>{report.data.status.toLowerCase()}</Badge>}
        </div>
      </div>
      {reviewed && <p className="text-xs text-success">Reviewed by your manager — this report is locked.</p>}
      <FormField label="Project"><Input value={form.project} disabled={reviewed} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="e.g. SomHR Platform" /></FormField>
      <FormField label="Tasks completed" required><Textarea rows={3} value={form.tasksCompleted} disabled={reviewed} onChange={(e) => setForm({ ...form, tasksCompleted: e.target.value })} placeholder="What did you accomplish today?" /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Work in progress"><Textarea rows={2} value={form.workInProgress} disabled={reviewed} onChange={(e) => setForm({ ...form, workInProgress: e.target.value })} /></FormField>
        <FormField label="Blockers"><Textarea rows={2} value={form.blockers} disabled={reviewed} onChange={(e) => setForm({ ...form, blockers: e.target.value })} placeholder="Anything blocking you?" /></FormField>
      </div>
      <FormField label="Comments"><Input value={form.comments} disabled={reviewed} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></FormField>
      {report.data?.reviewNote && <div className="rounded-lg bg-surface-sunken p-3 text-sm"><p className="text-xs uppercase tracking-wide text-text-faint mb-0.5">Manager note</p>{report.data.reviewNote}</div>}
      {!reviewed && (
        <div className="flex gap-2">
          <Button variant="secondary" loading={save.isPending} disabled={!valid} onClick={() => save.mutate(payload(false))}>Save draft</Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(payload(true))}><Send /> Submit EOD</Button>
        </div>
      )}
    </Card>
  );
}

/* ───────────── employee: history ───────────── */
function HistoryTab() {
  const reports = useMyEod();
  if (reports.isLoading) return <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>;
  if (!reports.data?.length) return <EmptyState icon={ListChecks} title="No reports yet" description="Your submitted EODs will appear here." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {reports.data.map((r) => (
        <Card key={r.id} className="rounded-xl p-4">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-text">{formatDate(r.date)}</span><Badge variant={statusVariant(r.status)}>{r.status.toLowerCase()}</Badge></div>
          {r.project && <p className="mt-1 text-xs text-text-faint flex items-center gap-1"><FolderKanban className="size-3" /> {r.project}</p>}
          <p className="mt-2 text-sm text-text line-clamp-3">{r.tasksCompleted}</p>
        </Card>
      ))}
    </div>
  );
}

/* ───────────── summary ───────────── */
function SummaryTab() {
  const [period, setPeriod] = React.useState<"week" | "month">("week");
  const summary = useEodSummary(period);
  const d = summary.data;
  const maxC = Math.max(1, ...(d?.byProject ?? []).map((p) => p.count));
  return (
    <div className="space-y-4 max-w-2xl">
      <Select value={period} onValueChange={(v) => setPeriod(v as "week" | "month")}>
        <SelectTrigger className="w-40 h-9" aria-label="Period"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="week">This week</SelectItem><SelectItem value="month">This month</SelectItem></SelectContent>
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-xl p-4"><p className="text-xl font-semibold text-text tabular-nums">{d?.reports ?? 0}</p><p className="text-[11px] uppercase tracking-wide text-text-muted">Reports</p></Card>
        <Card className="rounded-xl p-4"><p className="text-xl font-semibold text-success tabular-nums">{d?.submitted ?? 0}</p><p className="text-[11px] uppercase tracking-wide text-text-muted">Submitted</p></Card>
      </div>
      <Card className="rounded-xl p-4">
        <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><FolderKanban className="size-4 text-primary dark:text-chart-3" /> Reports by project</p>
        {!d?.byProject.length ? <p className="text-sm text-text-faint">No reports in this period.</p> : (
          <div className="space-y-2">{d.byProject.map((p) => (
            <div key={p.project} className="flex items-center gap-2 text-xs"><span className="w-32 truncate text-text-muted">{p.project}</span><div className="flex-1 h-2 rounded-full bg-surface-sunken overflow-hidden"><div className="h-full bg-primary dark:bg-chart-3" style={{ width: `${(p.count / maxC) * 100}%` }} /></div><span className="w-12 text-right tabular-nums text-text-muted">{p.count}</span></div>
          ))}</div>
        )}
      </Card>
    </div>
  );
}

/* ───────────── manager: team ───────────── */
function ReviewDialog({ row, onClose }: { row: TeamRow | null; onClose: () => void }) {
  const review = useReviewEod();
  const [note, setNote] = React.useState("");
  React.useEffect(() => setNote(""), [row]);
  const r = row?.report;
  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{row?.employee.firstName} {row?.employee.lastName} · {r ? formatDate(r.date) : ""}</DialogTitle></DialogHeader>
        {r ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2"><Badge variant={statusVariant(r.status)}>{r.status.toLowerCase()}</Badge>{r.project && <Badge variant="default">{r.project}</Badge>}</div>
            <Field label="Tasks completed" value={r.tasksCompleted} />
            {r.workInProgress && <Field label="Work in progress" value={r.workInProgress} />}
            {r.blockers && <Field label="Blockers" value={r.blockers} />}
            {r.status !== "REVIEWED" && (
              <div className="border-t border-border pt-3 space-y-2">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (optional)" />
                <Button className="w-full" loading={review.isPending} onClick={async () => { await review.mutateAsync({ id: r.id, reviewNote: note || undefined }); onClose(); }}><CheckCircle2 /> Mark reviewed</Button>
              </div>
            )}
          </div>
        ) : <p className="text-sm text-text-faint">No report submitted for this day.</p>}
      </DialogContent>
    </Dialog>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-wide text-text-faint mb-0.5">{label}</p><p className="text-text whitespace-pre-wrap">{value}</p></div>;
}

function TeamTab() {
  const [date, setDate] = React.useState(TODAY);
  const team = useTeamEod(date, true);
  const [open, setOpen] = React.useState<TeamRow | null>(null);
  const rows = team.data?.rows ?? [];
  const submitted = rows.filter((r) => r.status === "SUBMITTED" || r.status === "REVIEWED").length;
  const missed = rows.filter((r) => r.status === "MISSED").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" max={TODAY} value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" aria-label="Date" />
        <span className="text-sm text-text-muted">{submitted}/{rows.length} submitted{missed > 0 && <span className="text-danger"> · {missed} missed</span>}</span>
      </div>
      {team.isLoading ? <Skeleton className="h-48 rounded-xl" /> : !rows.length ? (
        <EmptyState icon={Users} title="No team members" description="You have no direct reports." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.employee.id} className={cn("rounded-xl p-4 transition-shadow", row.report && "hover:shadow-raised cursor-pointer")} onClick={() => row.report && setOpen(row)}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 min-w-0"><Avatar size="sm">{row.employee.photoUrl && <AvatarImage src={row.employee.photoUrl} alt="" />}<AvatarFallback>{initials(row.employee.firstName, row.employee.lastName)}</AvatarFallback></Avatar><span className="min-w-0"><span className="block text-sm font-medium text-text truncate">{row.employee.firstName} {row.employee.lastName}</span><span className="block text-[11px] text-text-faint truncate">{row.employee.designation?.title ?? row.employee.employeeCode}</span></span></span>
                {row.status === "MISSED" ? <Badge variant="danger"><AlertTriangle className="size-3" /> missed</Badge> : row.status === "WEEKEND" ? <Badge variant="default">week-off</Badge> : <Badge variant={statusVariant(row.status)}>{row.status.toLowerCase()}</Badge>}
              </div>
              {row.report && <p className="mt-2 text-xs text-text-muted line-clamp-2">{row.report.tasksCompleted}</p>}
              {row.report?.project && <p className="mt-1 text-[11px] text-text-faint">{row.report.project}</p>}
            </Card>
          ))}
        </div>
      )}
      <ReviewDialog row={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/* ───────────── manager: dashboard ───────────── */
function DashboardTab() {
  const dash = useEodDashboard(true);
  const to = TODAY; const fromD = new Date(); fromD.setDate(fromD.getDate() - 29);
  const proj = useProjectAnalytics(iso(fromD), to, true);
  const d = dash.data;
  const maxR = Math.max(1, ...(proj.data?.projects ?? []).map((p) => p.reports));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Submitted today", value: d ? `${d.submittedToday}/${d.team}` : undefined, accent: "text-success" },
          { label: "Pending review", value: d?.pendingReview, accent: "text-warning" },
          { label: "Missed today", value: d?.missedToday, accent: "text-danger" },
          { label: "Reports this week", value: d?.reportsThisWeek, accent: "text-primary dark:text-chart-3" },
        ].map((c) => (
          <Card key={c.label} className="rounded-xl p-4"><p className={cn("text-xl font-semibold tabular-nums", c.accent)}>{dash.isLoading ? <Skeleton className="h-7 w-12" /> : c.value ?? 0}</p><p className="text-[11px] uppercase tracking-wide text-text-muted">{c.label}</p></Card>
        ))}
      </div>
      <Card className="rounded-xl p-4">
        <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><BarChart3 className="size-4 text-primary dark:text-chart-3" /> Project productivity (last 30 days)</p>
        {!proj.data?.projects.length ? <p className="text-sm text-text-faint">No reports in this period.</p> : (
          <div className="space-y-2">{proj.data.projects.map((p) => (
            <div key={p.project} className="flex items-center gap-2 text-xs"><span className="w-36 truncate text-text-muted">{p.project}</span><div className="flex-1 h-2 rounded-full bg-surface-sunken overflow-hidden"><div className="h-full bg-primary dark:bg-chart-3" style={{ width: `${(p.reports / maxR) * 100}%` }} /></div><span className="w-24 text-right tabular-nums text-text-muted">{p.reports} report{p.reports === 1 ? "" : "s"} · {p.contributors}👤</span></div>
          ))}</div>
        )}
      </Card>
    </div>
  );
}

export function EodPage() {
  const { can } = usePermissions();
  const isManager = can("eod:read_all", "eod:review");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text flex items-center gap-2"><CalendarDays className="size-5 text-primary dark:text-chart-3" /> Daily Reports</h1>
        <p className="text-sm text-text-muted">Submit your end-of-day report and track your work.</p>
      </div>
      <Tabs defaultValue="today">
        <TabsList className="flex-wrap">
          <TabsTrigger value="today"><ClipboardList /> My EOD</TabsTrigger>
          <TabsTrigger value="history"><ListChecks /> History</TabsTrigger>
          <TabsTrigger value="summary"><BarChart3 /> Summary</TabsTrigger>
          {isManager && <TabsTrigger value="team"><Users /> Team</TabsTrigger>}
          {isManager && <TabsTrigger value="dashboard"><BarChart3 /> Dashboard</TabsTrigger>}
        </TabsList>
        <TabsContent value="today"><TodayForm /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
        <TabsContent value="summary"><SummaryTab /></TabsContent>
        {isManager && <TabsContent value="team"><TeamTab /></TabsContent>}
        {isManager && <TabsContent value="dashboard"><DashboardTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
