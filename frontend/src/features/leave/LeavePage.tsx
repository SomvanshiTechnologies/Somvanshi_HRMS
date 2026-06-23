import * as React from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  HelpCircle,
  Plus,
  Settings2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { LeavePolicyBuilder } from "./LeavePolicyBuilder";
import { ImportDialog } from "@/features/imports/ImportDialog";
import { ImportHistory } from "@/features/imports/ImportHistory";
import {
  useAddHoliday,
  useApplyLeave,
  useBulkApprove,
  useCancelLeave,
  useDecideLeave,
  useHolidays,
  useLeaveCalendar,
  useLeaveTypes,
  useLeaveWorkflow,
  useMyBalances,
  useMyLeaveRequests,
  usePendingApprovals,
  useRemoveHoliday,
  useRequestLeaveInfo,
  useSetLeaveWorkflow,
  type LeaveRequest,
} from "./useLeave";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { cn, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ================= balances + apply ================= */

function BalancesRow({ onApply }: { onApply: () => void }) {
  const balances = useMyBalances();
  if (balances.isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }
  if (balances.isError) return <ErrorState message={apiErrorMessage(balances.error)} onRetry={() => balances.refetch()} />;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {(balances.data ?? []).map((b, i) => (
        <motion.div key={b.leaveType.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <Card className="rounded-xl p-4 h-full hover:shadow-raised transition-shadow cursor-pointer" onClick={onApply}>
            <div className="flex items-center justify-between">
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: b.leaveType.colorHex }}>
                {b.leaveType.code}
              </span>
              {!b.leaveType.isPaid && <Badge className="text-[10px]">Unpaid</Badge>}
            </div>
            <p className="mt-2.5 text-2xl font-semibold text-text tabular-nums">
              {b.leaveType.code === "LOP" || b.leaveType.code === "CO" ? b.used : b.available}
            </p>
            <p className="text-[11px] text-text-muted leading-tight">
              {b.leaveType.code === "LOP" || b.leaveType.code === "CO" ? "days taken" : `available of ${b.entitled + b.carriedOver}`}
            </p>
            <p className="mt-1 text-[11px] font-medium text-text truncate">{b.leaveType.name}</p>
            {b.pending > 0 && <p className="text-[10px] text-warning">{b.pending} pending</p>}
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function ApplyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const types = useLeaveTypes();
  const apply = useApplyLeave();
  const [leaveTypeId, setLeaveTypeId] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [startUnit, setStartUnit] = React.useState("FULL_DAY");
  const [reason, setReason] = React.useState("");

  const selectedType = types.data?.find((t) => t.id === leaveTypeId);
  const sameDay = startDate && startDate === endDate;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>Your request follows the company approval chain — you'll be notified at each step.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Leave type" required>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger aria-label="Leave type"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {(types.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: t.colorHex }} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="From" htmlFor="lv-start" required>
              <Input id="lv-start" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (!endDate || e.target.value > endDate) setEndDate(e.target.value); }} />
            </FormField>
            <FormField label="To" htmlFor="lv-end" required>
              <Input id="lv-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </FormField>
          </div>
          {sameDay && (
            <FormField label="Duration">
              <Select value={startUnit} onValueChange={setStartUnit}>
                <SelectTrigger aria-label="Duration"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL_DAY">Full day</SelectItem>
                  <SelectItem value="FIRST_HALF">First half</SelectItem>
                  <SelectItem value="SECOND_HALF">Second half</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
          <FormField label="Reason" htmlFor="lv-reason" required hint={selectedType?.policies?.[0]?.requiresDocument ? "This leave type requires a supporting document — share it with HR." : undefined}>
            <Textarea id="lv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Brief reason for your leave" />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!leaveTypeId || !startDate || !endDate || reason.length < 5}
            loading={apply.isPending}
            onClick={async () => {
              await apply.mutateAsync({ leaveTypeId, startDate, endDate, startUnit, endUnit: startUnit, reason });
              onClose();
              setLeaveTypeId(""); setStartDate(""); setEndDate(""); setReason(""); setStartUnit("FULL_DAY");
            }}
          >
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================= request card (shared) ================= */

function StepProgress({ request }: { request: LeaveRequest }) {
  return (
    <div className="flex items-center gap-1.5">
      {request.steps.map((step) => (
        <span
          key={step.id}
          title={`Step ${step.sequence}: ${step.approverType === "MANAGER" ? "Manager" : step.roleName} — ${step.status}`}
          className={cn(
            "h-1.5 w-7 rounded-full",
            step.status === "APPROVED" ? "bg-success" : step.status === "REJECTED" ? "bg-danger" :
            step.sequence === request.currentStep && request.status === "PENDING" ? "bg-warning" : "bg-border"
          )}
        />
      ))}
    </div>
  );
}

function RequestCard({ request, mine, onCancel }: { request: LeaveRequest; mine?: boolean; onCancel?: (id: string) => void }) {
  return (
    <Card className="rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {!mine && (
            <Avatar size="md">
              {request.employee.photoUrl && <AvatarImage src={request.employee.photoUrl} alt="" />}
              <AvatarFallback>{initials(request.employee.firstName, request.employee.lastName)}</AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">
              {!mine && `${request.employee.firstName} ${request.employee.lastName} · `}
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full inline-block" style={{ backgroundColor: request.leaveType.colorHex }} />
                {request.leaveType.name}
              </span>
            </p>
            <p className="text-xs text-text-muted">
              {formatDate(request.startDate)} → {formatDate(request.endDate)} · {request.days} day{request.days !== 1 ? "s" : ""}
            </p>
            <p className="mt-1 text-xs text-text-muted line-clamp-1">{request.reason}</p>
            {request.moreInfoNote && (
              <p className="mt-1 text-xs text-warning flex items-center gap-1">
                <HelpCircle className="size-3.5" /> Info requested: {request.moreInfoNote}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
          <StepProgress request={request} />
          {mine && ["PENDING", "APPROVED"].includes(request.status) && new Date(request.startDate) > new Date() && onCancel && (
            <Button variant="ghost" size="sm" className="text-danger hover:text-danger h-7" onClick={() => onCancel(request.id)}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ================= my leave tab ================= */

function MyLeaveTab() {
  const requests = useMyLeaveRequests();
  const cancel = useCancelLeave();
  const [applyOpen, setApplyOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">My balances</h2>
        <Button size="sm" onClick={() => setApplyOpen(true)}><Plus /> Apply Leave</Button>
      </div>
      <BalancesRow onApply={() => setApplyOpen(true)} />

      <h2 className="text-sm font-semibold text-text pt-2">My requests</h2>
      {requests.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : requests.isError ? (
        <ErrorState message={apiErrorMessage(requests.error)} onRetry={() => requests.refetch()} />
      ) : !requests.data?.length ? (
        <EmptyState icon={CalendarDays} title="No leave requests yet" description="Apply for leave and track approvals here." />
      ) : (
        <div className="space-y-2.5">
          {requests.data.map((r) => (
            <RequestCard key={r.id} request={r} mine onCancel={(id) => cancel.mutate(id)} />
          ))}
        </div>
      )}
      <ApplyDialog open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}

/* ================= calendar tab ================= */

function CalendarTab() {
  const { can } = usePermissions();
  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const [scope, setScope] = React.useState<"team" | "org">("team");
  const calendar = useLeaveCalendar(month, year, scope);

  const shift = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const label = new Date(year, month - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });

  const leavesByDay = new Map<number, Array<{ name: string; color: string; status: string }>>();
  for (const req of calendar.data?.requests ?? []) {
    const start = new Date(req.startDate);
    const end = new Date(req.endDate);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      if (date >= new Date(start.toDateString()) && date <= new Date(end.toDateString())) {
        const list = leavesByDay.get(d) ?? [];
        list.push({
          name: `${req.employee.firstName} ${req.employee.lastName[0]}.`,
          color: req.leaveType.colorHex,
          status: req.status,
        });
        leavesByDay.set(d, list);
      }
    }
  }
  const holidaysByDay = new Map<number, string>();
  for (const h of calendar.data?.holidays ?? []) {
    holidaysByDay.set(new Date(h.date).getDate(), h.name);
  }

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm">{label}</CardTitle>
        <div className="flex items-center gap-2">
          {can("leave:read_all") && (
            <Select value={scope} onValueChange={(v) => setScope(v as "team" | "org")}>
              <SelectTrigger className="w-32 h-8" aria-label="Calendar scope"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="team">My team</SelectItem>
                <SelectItem value="org">Organization</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button variant="secondary" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></Button>
          <Button variant="secondary" size="icon-sm" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-5">
        {calendar.isLoading ? (
          <Skeleton className="h-80 w-full rounded-xl" />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-px text-center text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                <span key={d} className={cn(i === 0 && "text-danger/60")}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDow }).map((_, i) => <span key={`pad-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const holiday = holidaysByDay.get(d);
                const leaves = leavesByDay.get(d) ?? [];
                const dow = new Date(year, month - 1, d).getDay();
                const isToday = d === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();
                return (
                  <div
                    key={d}
                    className={cn(
                      "min-h-[4.5rem] rounded-lg border p-1.5 text-xs transition-colors",
                      holiday ? "bg-orange-50 border-orange-300 dark:bg-orange-950/30 dark:border-orange-700/40" : (dow === 0 || dow === 6) ? "bg-surface-sunken/50 border-border/60" : "border-border",
                      isToday && "ring-2 ring-primary ring-offset-1 ring-offset-surface"
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span className={cn("font-semibold tabular-nums", isToday ? "text-primary" : dow === 0 ? "text-danger/70" : "text-text")}>{d}</span>
                      {isToday && <span className="rounded bg-primary px-1 text-[8px] font-bold uppercase leading-4 text-white">Today</span>}
                    </span>
                    {holiday && <p className="mt-0.5 text-[10px] text-info font-medium line-clamp-1" title={holiday}>{holiday}</p>}
                    {leaves.slice(0, 2).map((l, idx) => (
                      <p key={idx} className={cn("mt-0.5 truncate rounded-sm px-1 py-px text-[10px] font-medium text-white leading-tight", l.status === "PENDING" && "opacity-60")} style={{ backgroundColor: l.color }} title={`${l.name} (${l.status})`}>
                        {l.name}
                      </p>
                    ))}
                    {leaves.length > 2 && <p className="mt-0.5 text-[10px] text-text-faint font-medium">+{leaves.length - 2} more</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ================= approvals tab ================= */

function ApprovalsTab() {
  const approvals = usePendingApprovals(true);
  const decide = useDecideLeave();
  const requestInfo = useRequestLeaveInfo();
  const bulk = useBulkApprove();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [infoFor, setInfoFor] = React.useState<LeaveRequest | null>(null);
  const [infoNote, setInfoNote] = React.useState("");
  const [rejectFor, setRejectFor] = React.useState<LeaveRequest | null>(null);
  const [rejectNote, setRejectNote] = React.useState("");

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      {(approvals.data?.length ?? 0) > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 shadow-card">
          <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-(--brand-primary)"
              checked={selected.size === approvals.data!.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(approvals.data!.map((r) => r.id)) : new Set())}
            />
            Select all ({approvals.data!.length})
          </label>
          <Button size="sm" disabled={!selected.size} loading={bulk.isPending} onClick={async () => { await bulk.mutateAsync({ requestIds: [...selected] }); setSelected(new Set()); }}>
            <Check /> Approve selected ({selected.size})
          </Button>
        </div>
      )}

      {approvals.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : approvals.isError ? (
        <ErrorState message={apiErrorMessage(approvals.error)} onRetry={() => approvals.refetch()} />
      ) : !approvals.data?.length ? (
        <EmptyState icon={ClipboardCheck} title="Nothing awaiting your approval" description="Requests appear here when it's your turn in the chain." />
      ) : (
        <div className="space-y-2.5">
          {approvals.data.map((request) => (
            <div key={request.id} className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-5 size-4 accent-(--brand-primary) shrink-0 cursor-pointer"
                checked={selected.has(request.id)}
                onChange={() => toggle(request.id)}
                aria-label="Select request"
              />
              <div className="flex-1 min-w-0">
                <Card className="rounded-xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar size="md">
                        {request.employee.photoUrl && <AvatarImage src={request.employee.photoUrl} alt="" />}
                        <AvatarFallback>{initials(request.employee.firstName, request.employee.lastName)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text">
                          {request.employee.firstName} {request.employee.lastName}
                          <Badge className="ml-2 font-mono text-[10px]">{request.employee.employeeCode}</Badge>
                        </p>
                        <p className="text-xs text-text-muted">
                          <span className="inline-flex items-center gap-1">
                            <span className="size-2 rounded-full inline-block" style={{ backgroundColor: request.leaveType.colorHex }} />
                            {request.leaveType.name}
                          </span>
                          {" · "}{formatDate(request.startDate)} → {formatDate(request.endDate)} · <strong>{request.days}d</strong>
                        </p>
                        <p className="mt-1 text-xs text-text-muted line-clamp-2">{request.reason}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setInfoFor(request); setInfoNote(""); }}>
                        <HelpCircle /> Ask info
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { setRejectFor(request); setRejectNote(""); }}>
                        <X className="text-danger" /> Reject
                      </Button>
                      <Button size="sm" loading={decide.isPending && decide.variables?.id === request.id} onClick={() => decide.mutate({ id: request.id, decision: "approve" })}>
                        <Check /> Approve
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 text-[11px] text-text-faint">
                    Step {request.currentStep} of {request.steps.length} <StepProgress request={request} />
                  </div>
                </Card>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ask info dialog */}
      <Dialog open={Boolean(infoFor)} onOpenChange={(o) => !o && setInfoFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request more information</DialogTitle></DialogHeader>
          <FormField label="Your question" htmlFor="info-note" required>
            <Textarea id="info-note" rows={3} value={infoNote} onChange={(e) => setInfoNote(e.target.value)} placeholder="e.g. Can you share the medical certificate?" />
          </FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setInfoFor(null)}>Cancel</Button>
            <Button disabled={infoNote.length < 5} loading={requestInfo.isPending} onClick={async () => { await requestInfo.mutateAsync({ id: infoFor!.id, note: infoNote }); setInfoFor(null); }}>
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* reject dialog */}
      <Dialog open={Boolean(rejectFor)} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject leave request</DialogTitle></DialogHeader>
          <FormField label="Reason" htmlFor="rej-note">
            <Textarea id="rej-note" rows={3} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="The employee will see this." />
          </FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="danger" loading={decide.isPending} onClick={async () => { await decide.mutateAsync({ id: rejectFor!.id, decision: "reject", remarks: rejectNote || undefined }); setRejectFor(null); }}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================= admin tab (holidays + workflow + policies + import) ================= */

const ROLE_OPTIONS = ["HR_ADMIN", "HR_EXECUTIVE", "DEPARTMENT_HEAD", "FINANCE_MANAGER", "SUPER_ADMIN"];
const ADMIN_SECTIONS = ["import", "holidays", "workflow", "policies"] as const;
type AdminSection = typeof ADMIN_SECTIONS[number];

function AdminTab() {
  const year = new Date().getFullYear();
  const holidays = useHolidays(year);
  const addHoliday = useAddHoliday();
  const removeHoliday = useRemoveHoliday();
  const workflow = useLeaveWorkflow(true);
  const setWorkflow = useSetLeaveWorkflow();

  const [section, setSection] = React.useState<AdminSection>("import");
  const [holidayName, setHolidayName] = React.useState("");
  const [holidayDate, setHolidayDate] = React.useState("");
  const [holidayPage, setHolidayPage] = React.useState(1);
  const HOLIDAYS_PER_PAGE = 10;
  const [steps, setSteps] = React.useState<Array<{ type: "MANAGER" | "ROLE"; role?: string }> | null>(null);

  const effectiveSteps = steps ?? (workflow.data?.steps as Array<{ type: "MANAGER" | "ROLE"; role?: string }> | undefined) ?? [];

  return (
    <div className="space-y-4">
      {/* section nav */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {([
          { key: "import" as const, label: "Import Data", icon: Upload },
          { key: "holidays" as const, label: "Holiday Calendar", icon: CalendarPlus },
          { key: "workflow" as const, label: "Approval Workflow", icon: Settings2 },
          { key: "policies" as const, label: "Leave Policies", icon: ClipboardCheck },
        ]).map((s) => (
          <Button
            key={s.key}
            variant={section === s.key ? "primary" : "ghost"}
            size="sm"
            onClick={() => setSection(s.key)}
          >
            <s.icon className="size-4" /> {s.label}
          </Button>
        ))}
      </div>

      {/* holidays */}
      {section === "holidays" && (
        <Card className="rounded-xl">
          <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">Holiday Calendar — {year}</CardTitle>
            <div className="flex gap-2">
              <ImportDialog type="holiday" title="Import holidays" onCompleted={() => holidays.refetch()}>
                <Button variant="secondary" size="sm"><Upload /> Import Excel</Button>
              </ImportDialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Holiday name" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} aria-label="Holiday name" className="flex-1 min-w-[160px]" />
              <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} className="w-44" aria-label="Holiday date" />
              <Button
                size="sm"
                disabled={holidayName.length < 2 || !holidayDate}
                loading={addHoliday.isPending}
                onClick={async () => {
                  await addHoliday.mutateAsync({ name: holidayName, date: holidayDate, isOptional: false });
                  setHolidayName(""); setHolidayDate("");
                }}
              >
                <Plus /> Add Holiday
              </Button>
            </div>
            {!holidays.data?.length ? (
              <EmptyState icon={CalendarPlus} title="No holidays yet" description="Add holidays manually or import from an Excel file." />
            ) : (
              <>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold w-10">#</th>
                        <th className="px-4 py-2.5 font-semibold">Holiday</th>
                        <th className="px-4 py-2.5 font-semibold">Date</th>
                        <th className="px-4 py-2.5 font-semibold">Type</th>
                        <th className="px-4 py-2.5 font-semibold w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {holidays.data.slice((holidayPage - 1) * HOLIDAYS_PER_PAGE, holidayPage * HOLIDAYS_PER_PAGE).map((h, idx) => (
                        <tr key={h.id} className="border-t border-border hover:bg-surface-sunken/40">
                          <td className="px-4 py-2.5 text-text-faint tabular-nums">{(holidayPage - 1) * HOLIDAYS_PER_PAGE + idx + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-text">{h.name}</td>
                          <td className="px-4 py-2.5 text-text-muted tabular-nums">{formatDate(h.date)}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant={h.isOptional ? "warning" : "success"}>{h.isOptional ? "Optional" : "Gazetted"}</Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <Button variant="ghost" size="icon-sm" aria-label="Remove holiday" onClick={() => removeHoliday.mutate(h.id)}>
                              <Trash2 className="text-danger size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {holidays.data.length > HOLIDAYS_PER_PAGE && (
                  <div className="flex items-center justify-between pt-3">
                    <p className="text-xs text-text-muted">
                      Showing {(holidayPage - 1) * HOLIDAYS_PER_PAGE + 1}–{Math.min(holidayPage * HOLIDAYS_PER_PAGE, holidays.data.length)} of {holidays.data.length} holidays
                    </p>
                    <div className="flex gap-1.5">
                      <Button variant="secondary" size="sm" disabled={holidayPage <= 1} onClick={() => setHolidayPage((p) => p - 1)}>
                        <ChevronLeft /> Prev
                      </Button>
                      <Button variant="secondary" size="sm" disabled={holidayPage >= Math.ceil(holidays.data.length / HOLIDAYS_PER_PAGE)} onClick={() => setHolidayPage((p) => p + 1)}>
                        Next <ChevronRight />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* workflow */}
      {section === "workflow" && (
        <Card className="rounded-xl max-w-2xl">
          <CardHeader>
            <CardTitle className="text-sm">Leave Approval Workflow</CardTitle>
            <p className="text-xs text-text-muted">Requests pass through each step in order. Changes apply to new requests only.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {effectiveSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Badge variant="primary" className="shrink-0">Step {i + 1}</Badge>
                <Select
                  value={step.type === "MANAGER" ? "MANAGER" : `ROLE:${step.role}`}
                  onValueChange={(v) => {
                    const next = [...effectiveSteps];
                    next[i] = v === "MANAGER" ? { type: "MANAGER" } : { type: "ROLE", role: v.slice(5) };
                    setSteps(next);
                  }}
                >
                  <SelectTrigger aria-label={`Step ${i + 1}`} className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANAGER">Reporting Manager</SelectItem>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={`ROLE:${r}`}>{r.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon-sm" aria-label="Remove step" disabled={effectiveSteps.length <= 1} onClick={() => setSteps(effectiveSteps.filter((_, idx) => idx !== i))}>
                  <Trash2 className="size-3.5 text-danger" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between pt-2">
              <Button variant="secondary" size="sm" disabled={effectiveSteps.length >= 5} onClick={() => setSteps([...effectiveSteps, { type: "ROLE", role: "HR_ADMIN" }])}>
                <Plus /> Add Step
              </Button>
              <Button size="sm" disabled={!steps} loading={setWorkflow.isPending} onClick={async () => { await setWorkflow.mutateAsync(effectiveSteps); setSteps(null); }}>
                Save Workflow
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* policies */}
      {section === "policies" && <LeavePolicyBuilder />}

      {/* import */}
      {section === "import" && (
        <div className="space-y-4">
          <Card className="rounded-xl">
            <CardHeader>
              <CardTitle className="text-sm">Import Leave Data</CardTitle>
              <p className="text-xs text-text-muted">Bring in historical leave balances and transactions from Excel. Preview and validate before importing.</p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <ImportDialog type="leave_balance" title="Import leave balances">
                <Button variant="secondary"><Upload /> Import Balances</Button>
              </ImportDialog>
              <ImportDialog type="leave_txn" title="Import leave transactions">
                <Button variant="secondary"><Upload /> Import Transactions</Button>
              </ImportDialog>
            </CardContent>
          </Card>
          <ImportHistory type="leave_balance" title="Leave balance import history" />
          <ImportHistory type="leave_txn" title="Leave transaction import history" />
        </div>
      )}
    </div>
  );
}

/* ================= page ================= */

export function LeavePage() {
  const { can } = usePermissions();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Leave Management</h1>
        <p className="text-sm text-text-muted">Balances, requests, team calendar and approvals — all in one place.</p>
      </div>
      <Tabs defaultValue="me">
        <TabsList>
          <TabsTrigger value="me"><CalendarDays /> My Leave</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarPlus /> Calendar</TabsTrigger>
          {can("leave:approve") && <TabsTrigger value="approvals"><ClipboardCheck /> Approvals</TabsTrigger>}
          {can("leave:manage") && <TabsTrigger value="admin"><Settings2 /> Settings</TabsTrigger>}
        </TabsList>
        <TabsContent value="me"><MyLeaveTab /></TabsContent>
        <TabsContent value="calendar"><CalendarTab /></TabsContent>
        {can("leave:approve") && <TabsContent value="approvals"><ApprovalsTab /></TabsContent>}
        {can("leave:manage") && <TabsContent value="admin"><AdminTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
