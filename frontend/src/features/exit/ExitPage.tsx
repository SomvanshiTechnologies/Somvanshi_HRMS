import * as React from "react";
import { motion } from "framer-motion";
import {
  CalendarX2, CheckCircle2, ClipboardCheck, DoorOpen, FileSignature, Lock,
  LogOut, MessageSquareText, Plus, ShieldCheck, Wallet,
} from "lucide-react";
import {
  EXIT_DOC_TYPES, openExitDocument,
  RESIGNATION_STATUSES, useAcceptResignation, useCalcFnf, useDecideFnf,
  useExitSummary, useResignation, useResignations, useRetractResignation,
  useSaveInterview, useSubmitResignation, useUpdateClearance,
  type ClearanceItem, type Resignation,
} from "./useExit";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { cn, formatDate, formatINR, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";

const inr = (v: string | number) => formatINR(Number(v));

function clearanceProgress(items: ClearanceItem[]): number {
  if (!items.length) return 0;
  return Math.round((items.filter((i) => i.status === "CLEARED").length / items.length) * 100);
}

function ResignationCard({ r, onOpen }: { r: Resignation; onOpen: () => void }) {
  const pct = clearanceProgress(r.clearanceItems);
  return (
    <Card className="rounded-xl p-4 hover:shadow-raised transition-shadow cursor-pointer" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar size="sm">
            {r.employee.photoUrl && <AvatarImage src={r.employee.photoUrl} alt="" />}
            <AvatarFallback>{initials(r.employee.firstName, r.employee.lastName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-semibold text-text truncate">{r.employee.firstName} {r.employee.lastName}</p>
            <p className="text-xs text-text-muted truncate">{r.employee.designation?.title ?? r.employee.employeeCode}</p>
          </div>
        </div>
        <Badge variant={statusVariant(r.status)}>{r.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div><p className="text-text-faint">Last working day</p><p className="text-text font-medium">{formatDate(r.lastWorkingDay)}</p></div>
        <div><p className="text-text-faint">Notice</p><p className="text-text font-medium">{r.noticePeriodDays} days</p></div>
      </div>
      {r.clearanceItems.length > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-text-muted mb-1"><span>Clearance</span><span>{pct}%</span></div>
          <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden"><div className="h-full bg-primary dark:bg-chart-3" style={{ width: `${pct}%` }} /></div>
        </div>
      )}
    </Card>
  );
}

const STAGES = [
  { key: "SUBMITTED", label: "Submitted", icon: FileSignature },
  { key: "ACCEPTED", label: "Accepted", icon: CheckCircle2 },
  { key: "CLEARANCE", label: "Clearance", icon: ClipboardCheck },
  { key: "FNF", label: "Settlement", icon: Wallet },
  { key: "EXITED", label: "Relieved", icon: DoorOpen },
] as const;

function stageIndex(r: Resignation): number {
  if (r.status === "EXITED") return 4;
  if (r.fnf?.status === "SETTLED") return 4;
  if (r.fnf) return 3;
  if (r.status === "IN_NOTICE" || r.status === "ACCEPTED") return 2;
  if (r.status === "SUBMITTED") return 0;
  return 0;
}

function StageTimeline({ r }: { r: Resignation }) {
  const active = stageIndex(r);
  return (
    <div className="flex items-center justify-between">
      {STAGES.map((s, i) => {
        const done = i <= active;
        const Icon = s.icon;
        return (
          <React.Fragment key={s.key}>
            <div className="flex flex-col items-center gap-1">
              <div className={cn("flex size-8 items-center justify-center rounded-full", done ? "bg-primary text-primary-foreground dark:bg-chart-3" : "bg-surface-sunken text-text-faint")}>
                <Icon className="size-4" />
              </div>
              <span className={cn("text-[10px]", done ? "text-text" : "text-text-faint")}>{s.label}</span>
            </div>
            {i < STAGES.length - 1 && <div className={cn("h-0.5 flex-1 mx-1", i < active ? "bg-primary dark:bg-chart-3" : "bg-surface-sunken")} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ClearanceRow({ resignationId, item, canClear }: { resignationId: string; item: ClearanceItem; canClear: boolean }) {
  const update = useUpdateClearance();
  const Icon = item.status === "CLEARED" ? CheckCircle2 : item.status === "BLOCKED" ? Lock : ShieldCheck;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={cn("size-4 shrink-0", item.status === "CLEARED" ? "text-success" : item.status === "BLOCKED" ? "text-danger" : "text-text-faint")} />
        <div className="min-w-0">
          <p className="text-sm text-text truncate">{item.item}</p>
          <p className="text-[11px] text-text-faint">{item.department}{item.remarks ? ` · ${item.remarks}` : ""}</p>
        </div>
      </div>
      {canClear && item.status !== "CLEARED" && (
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="success" loading={update.isPending} onClick={() => update.mutate({ id: resignationId, itemId: item.id, status: "CLEARED" })}>Clear</Button>
          {item.status !== "BLOCKED" && <Button size="sm" variant="danger" onClick={() => update.mutate({ id: resignationId, itemId: item.id, status: "BLOCKED" })}>Block</Button>}
        </div>
      )}
      {item.status === "CLEARED" && <Badge variant="success">cleared</Badge>}
    </div>
  );
}

function FnfPanel({ r, canManage, canApprove }: { r: Resignation; canManage: boolean; canApprove: boolean }) {
  const calc = useCalcFnf();
  const decide = useDecideFnf();
  const [form, setForm] = React.useState({ pendingSalaryDays: 0, noticeRecoveryDays: 0, otherEarnings: 0, otherDeductions: 0 });
  const fnf = r.fnf;

  return (
    <div className="space-y-3">
      {fnf?.breakdown && (
        <Card className="rounded-lg p-3 bg-surface-sunken space-y-1.5">
          {fnf.breakdown.earnings.filter((l) => l.amount).map((l) => (
            <div key={l.label} className="flex justify-between text-xs"><span className="text-text-muted">{l.label}</span><span className="text-text tabular-nums">{inr(l.amount)}</span></div>
          ))}
          {fnf.breakdown.deductions.filter((l) => l.amount).map((l) => (
            <div key={l.label} className="flex justify-between text-xs"><span className="text-text-muted">{l.label}</span><span className="text-danger tabular-nums">−{inr(l.amount)}</span></div>
          ))}
          <div className="flex justify-between border-t border-border pt-1.5 text-sm font-semibold"><span>Net payable</span><span className="tabular-nums">{inr(fnf.netPayable)}</span></div>
          <Badge variant={statusVariant(fnf.status)}>{fnf.status.toLowerCase()}</Badge>
        </Card>
      )}

      {canManage && (!fnf || fnf.status === "CALCULATED") && (
        <Card className="rounded-lg p-3 space-y-2.5">
          <p className="text-xs font-medium text-text-muted">Compute settlement (leave encashment is automatic)</p>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Pending salary (days)"><Input type="number" min={0} value={form.pendingSalaryDays || ""} onChange={(e) => setForm({ ...form, pendingSalaryDays: Number(e.target.value) })} /></FormField>
            <FormField label="Notice shortfall (days)"><Input type="number" min={0} value={form.noticeRecoveryDays || ""} onChange={(e) => setForm({ ...form, noticeRecoveryDays: Number(e.target.value) })} /></FormField>
            <FormField label="Other earnings (₹)"><Input type="number" min={0} value={form.otherEarnings || ""} onChange={(e) => setForm({ ...form, otherEarnings: Number(e.target.value) })} /></FormField>
            <FormField label="Other deductions (₹)"><Input type="number" min={0} value={form.otherDeductions || ""} onChange={(e) => setForm({ ...form, otherDeductions: Number(e.target.value) })} /></FormField>
          </div>
          <Button size="sm" className="w-full" loading={calc.isPending} onClick={() => calc.mutate({ id: r.id, ...form })}>
            <Wallet /> {fnf ? "Recalculate" : "Calculate F&F"}
          </Button>
        </Card>
      )}

      {fnf?.status === "CALCULATED" && canApprove && (
        <Button className="w-full" loading={decide.isPending} onClick={() => decide.mutate({ id: r.id, action: "APPROVE" })}><CheckCircle2 /> Approve settlement</Button>
      )}
      {fnf?.status === "APPROVED" && canApprove && (
        <Button className="w-full" variant="success" loading={decide.isPending} onClick={() => decide.mutate({ id: r.id, action: "SETTLE" })}><DoorOpen /> Settle &amp; relieve employee</Button>
      )}
      {fnf?.status === "SETTLED" && (
        <div className="rounded-lg bg-success/10 p-3 text-sm text-success flex items-center gap-2"><CheckCircle2 className="size-4" /> Settled on {formatDate(fnf.settledAt)} — employee off-boarded.</div>
      )}
    </div>
  );
}

function InterviewPanel({ r, canConduct }: { r: Resignation; canConduct: boolean }) {
  const save = useSaveInterview();
  const [form, setForm] = React.useState({ sentiment: r.exitInterview?.sentiment ?? "NEUTRAL", summary: r.exitInterview?.summary ?? "" });
  if (!canConduct) {
    return r.exitInterview?.summary ? <p className="text-sm text-text-muted">{r.exitInterview.summary}</p> : <p className="text-sm text-text-faint">Exit interview not yet conducted.</p>;
  }
  return (
    <div className="space-y-2.5">
      <FormField label="Sentiment">
        <Select value={form.sentiment} onValueChange={(v) => setForm({ ...form, sentiment: v })}>
          <SelectTrigger aria-label="Sentiment"><SelectValue /></SelectTrigger>
          <SelectContent>{["POSITIVE", "NEUTRAL", "NEGATIVE"].map((s) => <SelectItem key={s} value={s}>{s.toLowerCase()}</SelectItem>)}</SelectContent>
        </Select>
      </FormField>
      <FormField label="Summary / key feedback"><Textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></FormField>
      <Button size="sm" className="w-full" loading={save.isPending} disabled={!form.summary.trim()} onClick={() => save.mutate({ id: r.id, conductedAt: new Date().toISOString(), sentiment: form.sentiment, summary: form.summary })}>
        <MessageSquareText /> Save exit interview
      </Button>
    </div>
  );
}

function DetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = usePermissions();
  const canApprove = can("exit:approve", "exit:manage");
  const canManage = can("exit:manage");
  const data = useResignation(id);
  const accept = useAcceptResignation();
  const retract = useRetractResignation();
  const r = data.data;

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader><SheetTitle>{r ? `${r.employee.firstName} ${r.employee.lastName}` : "Resignation"}</SheetTitle></SheetHeader>
        <SheetBody className="space-y-5">
          {data.isLoading || !r ? (
            <Skeleton className="h-72 rounded-xl" />
          ) : (
            <>
              <StageTimeline r={r} />

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-text-faint">Last working day</p><p className="text-text font-medium">{formatDate(r.lastWorkingDay)}</p></div>
                <div><p className="text-xs text-text-faint">Notice period</p><p className="text-text font-medium">{r.noticePeriodDays} days</p></div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-text-faint mb-1">Reason</p>
                <p className="text-sm text-text">{r.reason}</p>
              </div>

              {/* employee retract */}
              {r.status === "SUBMITTED" && !canApprove && (
                <Button variant="danger" className="w-full" loading={retract.isPending} onClick={async () => { await retract.mutateAsync(r.id); }}>Retract resignation</Button>
              )}

              {/* HR accept */}
              {r.status === "SUBMITTED" && canApprove && (
                <Button className="w-full" loading={accept.isPending} onClick={async () => { await accept.mutateAsync({ id: r.id }); }}>
                  <CheckCircle2 /> Accept &amp; start off-boarding
                </Button>
              )}

              {/* clearance */}
              {r.clearanceItems.length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-text flex items-center gap-1.5"><ClipboardCheck className="size-4 text-primary dark:text-chart-3" /> Clearance checklist</h4>
                  {r.clearanceItems.map((it) => <ClearanceRow key={it.id} resignationId={r.id} item={it} canClear={canApprove} />)}
                </section>
              )}

              {/* exit interview */}
              {(r.status === "IN_NOTICE" || r.status === "EXITED") && (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-text flex items-center gap-1.5"><MessageSquareText className="size-4 text-primary dark:text-chart-3" /> Exit interview</h4>
                  <InterviewPanel r={r} canConduct={canApprove} />
                </section>
              )}

              {/* F&F */}
              {(r.status === "IN_NOTICE" || r.status === "EXITED") && (canApprove || r.fnf) && (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-text flex items-center gap-1.5"><Wallet className="size-4 text-primary dark:text-chart-3" /> Full &amp; final settlement</h4>
                  <FnfPanel r={r} canManage={canManage} canApprove={canApprove} />
                </section>
              )}

              {/* branded exit documents */}
              {(r.status === "IN_NOTICE" || r.status === "EXITED") && (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-text flex items-center gap-1.5"><FileSignature className="size-4 text-primary dark:text-chart-3" /> Exit documents</h4>
                  <p className="text-xs text-text-muted">Branded PDFs generated from company branding — open in a new tab.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {EXIT_DOC_TYPES.filter((d) => d.type !== "fnf" || Boolean(r.fnf)).map((d) => (
                      <Button
                        key={d.type} size="sm" variant="secondary" className="justify-start"
                        onClick={() => openExitDocument(r.id, d.type).catch((e) => toast.error(apiErrorMessage(e)))}
                      >
                        <FileText className="size-3.5" /> {d.label}
                      </Button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function ResignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const submit = useSubmitResignation();
  const [form, setForm] = React.useState({ reason: "", noticePeriodDays: 60, lastWorkingDay: "" });
  const reset = () => setForm({ reason: "", noticePeriodDays: 60, lastWorkingDay: "" });
  const valid = form.reason.trim().length >= 10 && form.lastWorkingDay;
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Submit resignation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormField label="Reason for leaving" required><Textarea rows={4} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Share your reason — this stays confidential with HR." /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Notice period (days)" required><Input type="number" min={0} max={180} value={form.noticePeriodDays} onChange={(e) => setForm({ ...form, noticePeriodDays: Number(e.target.value) })} /></FormField>
            <FormField label="Proposed last working day" required><Input type="date" value={form.lastWorkingDay} onChange={(e) => setForm({ ...form, lastWorkingDay: e.target.value })} /></FormField>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          <Button variant="danger" disabled={!valid} loading={submit.isPending} onClick={async () => { await submit.mutateAsync({ reason: form.reason, noticePeriodDays: form.noticePeriodDays, lastWorkingDay: form.lastWorkingDay }); onOpenChange(false); reset(); }}>
            Submit resignation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function List({ scope, status }: { scope: "mine" | "all"; status: string }) {
  const list = useResignations({ scope, status: status === "all" ? undefined : status });
  const [openId, setOpenId] = React.useState<string | null>(null);
  if (list.isLoading) return <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>;
  if (list.isError) return <ErrorState message={apiErrorMessage(list.error)} onRetry={() => list.refetch()} />;
  const rows = list.data?.resignations ?? [];
  if (!rows.length) return <EmptyState icon={LogOut} title={scope === "mine" ? "No active exit" : "No resignations"} description={scope === "mine" ? "You have no resignation in progress." : "No off-boarding cases right now."} />;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}>
            <ResignationCard r={r} onOpen={() => setOpenId(r.id)} />
          </motion.div>
        ))}
      </div>
      <DetailSheet id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function StatusFilter({ status, setStatus }: { status: string; setStatus: (s: string) => void }) {
  return (
    <Select value={status} onValueChange={setStatus}>
      <SelectTrigger className="w-44 h-9" aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {RESIGNATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ExitPage() {
  const { can } = usePermissions();
  const isReviewer = can("exit:read_all", "exit:approve", "exit:manage");
  const summary = useExitSummary(isReviewer);
  const [resignOpen, setResignOpen] = React.useState(false);
  const [allStatus, setAllStatus] = React.useState("all");
  const [mineStatus, setMineStatus] = React.useState("all");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Exit Management</h1>
          <p className="text-sm text-text-muted">Resignations, off-boarding clearance, exit interviews and full &amp; final settlement.</p>
        </div>
        <Button variant="danger" onClick={() => setResignOpen(true)}><Plus /> Resign</Button>
      </div>

      {isReviewer && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active off-boarding", value: summary.data?.active, accent: "text-warning", icon: CalendarX2 },
            { label: "In notice", value: summary.data?.byStatus["IN_NOTICE"] ?? 0, accent: "text-info", icon: DoorOpen },
            { label: "Pending F&F", value: summary.data?.pendingFnf, accent: "text-text", icon: Wallet },
            { label: "Relieved", value: summary.data?.byStatus["EXITED"] ?? 0, accent: "text-success", icon: CheckCircle2 },
          ].map((c) => (
            <Card key={c.label} className="rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className={cn("text-xl font-semibold tabular-nums", c.accent)}>{summary.isLoading ? <Skeleton className="h-7 w-10" /> : c.value ?? 0}</p>
                <c.icon className="size-4 text-text-faint" />
              </div>
              <p className="text-[11px] uppercase tracking-wide text-text-muted mt-0.5">{c.label}</p>
            </Card>
          ))}
        </div>
      )}

      {isReviewer ? (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all"><LogOut /> Off-boarding</TabsTrigger>
            <TabsTrigger value="mine"><FileSignature /> My Exit</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="space-y-3">
            <StatusFilter status={allStatus} setStatus={setAllStatus} />
            <List scope="all" status={allStatus} />
          </TabsContent>
          <TabsContent value="mine" className="space-y-3">
            <StatusFilter status={mineStatus} setStatus={setMineStatus} />
            <List scope="mine" status={mineStatus} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-3">
          <StatusFilter status={mineStatus} setStatus={setMineStatus} />
          <List scope="mine" status={mineStatus} />
        </div>
      )}

      <ResignDialog open={resignOpen} onOpenChange={setResignOpen} />
    </div>
  );
}
