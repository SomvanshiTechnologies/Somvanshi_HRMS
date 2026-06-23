import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlarmClockCheck,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Download,
  LogIn,
  LogOut,
  Pencil,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  downloadAttendanceCsv,
  useAttendanceReport,
  useCheckIn,
  useCheckOut,
  useDayView,
  useDecideCorrection,
  useEndBreak,
  useMyCorrections,
  useMyMonth,
  usePendingCorrections,
  useRequestCorrection,
  useStartBreak,
  useToday,
  useBulkMark,
  useDeleteAttendance,
  type MonthDay,
  type DayRow,
} from "./useAttendance";
import { ManualMarkDialog } from "./ManualMarkDialog";
import { ImportDialog } from "@/features/imports/ImportDialog";
import { ImportHistory } from "@/features/imports/ImportHistory";
import { useAuthStore } from "@/stores/auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

/* ---------- live clock ---------- */
function useClock(): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtTime(value: string | null): string {
  return value ? new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
}
function fmtHours(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/* ---------- punch hero ---------- */
function PunchCard() {
  const now = useClock();
  const today = useToday();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const startBreak = useStartBreak();
  const endBreak = useEndBreak();

  const record = today.data?.record;
  const onBreak = Boolean(today.data?.activeBreak);
  const checkedIn = Boolean(record?.checkInAt);
  const checkedOut = Boolean(record?.checkOutAt);

  const liveWorkMinutes =
    checkedIn && !checkedOut && record?.checkInAt
      ? Math.max(0, Math.round((now.getTime() - new Date(record.checkInAt).getTime()) / 60000) - (record.breakMinutes ?? 0))
      : record?.workMinutes ?? 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl bg-gradient-to-br from-secondary via-primary to-(--chart-2) p-6 text-white shadow-raised"
    >
      <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: "radial-gradient(36rem 18rem at 85% -20%, #63b0cd 0%, transparent 55%)" }} aria-hidden />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-sm text-white/70">
            {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            {today.data?.shift && ` · ${today.data.shift.name} shift ${today.data.shift.startTime}–${today.data.shift.endTime}`}
          </p>
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{fmtClock(now)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {today.data?.onLeaveToday ? (
              <Badge variant="warning">On approved leave today</Badge>
            ) : checkedOut ? (
              <Badge variant="success">Day complete · {fmtHours(record!.workMinutes)}</Badge>
            ) : checkedIn ? (
              <>
                <Badge variant={onBreak ? "warning" : "success"}>{onBreak ? "On break" : "Working"}</Badge>
                <span className="text-white/80 tabular-nums">{fmtHours(liveWorkMinutes)} today</span>
                {record?.isLate && <Badge variant="danger">Late arrival</Badge>}
              </>
            ) : (
              <Badge>Not checked in</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!checkedIn && !today.data?.onLeaveToday && (
            <Button size="lg" className="bg-white text-primary hover:bg-white/90" loading={checkIn.isPending} onClick={() => checkIn.mutate()}>
              <LogIn /> Check In
            </Button>
          )}
          {checkedIn && !checkedOut && (
            <>
              {onBreak ? (
                <Button size="lg" variant="secondary" className="bg-white/15 border-white/25 text-white hover:bg-white/25" loading={endBreak.isPending} onClick={() => endBreak.mutate()}>
                  <Coffee /> End Break
                </Button>
              ) : (
                <Button size="lg" variant="secondary" className="bg-white/15 border-white/25 text-white hover:bg-white/25" loading={startBreak.isPending} onClick={() => startBreak.mutate()}>
                  <Coffee /> Break
                </Button>
              )}
              <Button size="lg" className="bg-white text-primary hover:bg-white/90" loading={checkOut.isPending} disabled={onBreak} onClick={() => checkOut.mutate()}>
                <LogOut /> Check Out
              </Button>
            </>
          )}
        </div>
      </div>
      {record && (
        <div className="relative z-10 mt-4 flex flex-wrap gap-5 text-sm text-white/80">
          <span>In: <strong className="text-white">{fmtTime(record.checkInAt)}</strong></span>
          <span>Out: <strong className="text-white">{fmtTime(record.checkOutAt)}</strong></span>
          <span>Breaks: <strong className="text-white">{record.breakMinutes}m</strong></span>
        </div>
      )}
    </motion.section>
  );
}

/* ---------- month calendar ---------- */
interface StatusStyle { label: string; dot: string; cell: string; text: string }
const STATUS_STYLE: Record<string, StatusStyle> = {
  PRESENT:        { label: "Present",  dot: "bg-success",       cell: "bg-success/10 border-success/30",          text: "text-success" },
  WORK_FROM_HOME: { label: "WFH",      dot: "bg-(--chart-3)",   cell: "bg-(--chart-3)/10 border-(--chart-3)/30",  text: "text-(--chart-3)" },
  HALF_DAY:       { label: "Half day", dot: "bg-warning",       cell: "bg-warning/10 border-warning/30",          text: "text-warning" },
  ON_LEAVE:       { label: "Leave",    dot: "bg-(--chart-6)",   cell: "bg-(--chart-6)/10 border-(--chart-6)/30",  text: "text-(--chart-6)" },
  ABSENT:         { label: "Absent",   dot: "bg-danger",        cell: "bg-danger/10 border-danger/30",            text: "text-danger" },
  HOLIDAY:        { label: "Holiday",  dot: "bg-info",          cell: "bg-info/10 border-info/30",                text: "text-info" },
  WEEK_OFF:       { label: "Week off", dot: "bg-border-strong", cell: "bg-surface-sunken border-border",          text: "text-text-faint" },
  FUTURE:         { label: "",         dot: "bg-transparent",   cell: "border-border/50 border-dashed",           text: "text-text-faint" },
};
const LEGEND = ["PRESENT", "WORK_FROM_HOME", "HALF_DAY", "ON_LEAVE", "ABSENT", "HOLIDAY", "WEEK_OFF"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MonthCalendar({
  month, year, days, onPrev, onNext, onDayClick, clickableAll,
}: {
  month: number; year: number; days: MonthDay[];
  onPrev: () => void; onNext: () => void;
  onDayClick?: (day: MonthDay) => void;
  clickableAll?: boolean;
}) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const label = new Date(year, month - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
  const todayKey = new Date().toLocaleDateString("en-CA");
  const actionable = (s: string) => (clickableAll ? s !== "FUTURE" : s !== "FUTURE" && s !== "WEEK_OFF" && s !== "HOLIDAY");

  return (
    <Card className="rounded-xl overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b border-border bg-surface-sunken/60">
        <CardTitle className="text-sm">{label}</CardTitle>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="icon-sm" onClick={onPrev} aria-label="Previous month"><ChevronLeft /></Button>
          <Button variant="secondary" size="icon-sm" onClick={onNext} aria-label="Next month"><ChevronRight /></Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-text-faint mb-2">
          {WEEKDAYS.map((d, i) => <span key={d} className={cn(i === 0 && "text-danger/60")}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: firstDow }).map((_, i) => <span key={`pad-${i}`} />)}
          {days.map((day) => {
            const num = Number(day.date.slice(-2));
            const isToday = day.date === todayKey;
            const st = STATUS_STYLE[day.status] ?? STATUS_STYLE.FUTURE!;
            const clickable = Boolean(onDayClick) && actionable(day.status);
            return (
              <button
                key={day.date}
                onClick={clickable ? () => onDayClick!(day) : undefined}
                title={`${day.status.replace(/_/g, " ")}${day.isLate ? " · late" : ""}${day.workMinutes ? ` · ${fmtHours(day.workMinutes)}` : ""}`}
                className={cn(
                  "relative flex min-h-[64px] flex-col rounded-lg border p-1.5 text-left transition-all",
                  st.cell,
                  clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-card" : "cursor-default",
                  isToday && "ring-2 ring-primary ring-offset-1 ring-offset-surface",
                )}
              >
                <span className="flex items-center justify-between">
                  <span className={cn("text-sm font-semibold tabular-nums leading-none", day.status === "FUTURE" ? "text-text-faint" : "text-text")}>{num}</span>
                  {isToday && <span className="rounded bg-primary px-1 text-[8px] font-bold uppercase leading-4 text-white">Today</span>}
                </span>
                {day.status !== "FUTURE" && (
                  <span className="mt-auto space-y-0.5">
                    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium leading-tight", st.text)}>
                      <span className={cn("size-1.5 rounded-full", st.dot)} aria-hidden /> {st.label}
                    </span>
                    {day.workMinutes > 0 && (
                      <span className="block text-[10px] tabular-nums text-text-muted">
                        {fmtHours(day.workMinutes)}{day.isLate ? <span className="text-danger"> · late</span> : ""}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-[11px] text-text-muted">
          {LEGEND.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", STATUS_STYLE[key]!.dot)} /> {STATUS_STYLE[key]!.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- my attendance tab ---------- */
function MyAttendanceTab() {
  const now = new Date();
  const { can } = usePermissions();
  const me = useAuthStore((s) => s.user);
  const canManage = can("attendance:manage") && Boolean(me?.employee);
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const monthData = useMyMonth(month, year);
  const corrections = useMyCorrections();
  const requestCorrection = useRequestCorrection();
  const [correctionDay, setCorrectionDay] = React.useState<MonthDay | null>(null);
  const [adminDay, setAdminDay] = React.useState<MonthDay | null>(null);
  const [inTime, setInTime] = React.useState("");
  const [outTime, setOutTime] = React.useState("");
  const [reason, setReason] = React.useState("");

  const shift = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
  };

  const s = monthData.data?.summary;

  return (
    <div className="space-y-4">
      {/* summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: "Working days", value: s?.workingDays, accent: "" },
          { label: "Present", value: s?.present, accent: "text-success" },
          { label: "Half days", value: s?.halfDay, accent: "text-warning" },
          { label: "On leave", value: s?.onLeave, accent: "text-(--chart-6)" },
          { label: "Absent", value: s?.absent, accent: "text-danger" },
          { label: "Hours", value: s ? fmtHours(s.workMinutes) : undefined, accent: "" },
        ].map((card) => (
          <Card key={card.label} className="rounded-xl p-4">
            <p className={cn("text-xl font-semibold tabular-nums", card.accent || "text-text")}>
              {monthData.isLoading ? <Skeleton className="h-7 w-12" /> : card.value ?? "—"}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-text-muted mt-0.5">{card.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          {monthData.isError ? (
            <ErrorState message={apiErrorMessage(monthData.error)} onRetry={() => monthData.refetch()} />
          ) : monthData.isLoading ? (
            <Skeleton className="h-96 rounded-xl" />
          ) : (
            <MonthCalendar
              month={month} year={year}
              days={monthData.data?.days ?? []}
              clickableAll={canManage}
              onPrev={() => shift(-1)} onNext={() => shift(1)}
              onDayClick={(day) => {
                if (day.status === "FUTURE") return;
                // Admins edit their own record directly — no correction request needed.
                if (canManage) { setAdminDay(day); return; }
                if (day.status === "WEEK_OFF" || day.status === "HOLIDAY") return;
                setCorrectionDay(day);
                setInTime(""); setOutTime(""); setReason("");
              }}
            />
          )}
        </div>

        <Card className="rounded-xl h-fit">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Pencil className="size-4" /> My corrections</CardTitle>
          </CardHeader>
          <CardContent>
            {!corrections.data?.length ? (
              <p className="text-sm text-text-faint">Click a day on the calendar to request a correction.</p>
            ) : (
              <div className="space-y-2.5">
                {corrections.data.slice(0, 6).map((c) => (
                  <div key={c["id"]} className="flex items-center justify-between gap-2 text-sm border-b border-border pb-2 last:border-0">
                    <span>
                      <span className="block font-medium text-text">{formatDate(c["attendance"]?.date)}</span>
                      <span className="block text-xs text-text-muted line-clamp-1">{c["reason"]}</span>
                    </span>
                    <Badge variant={statusVariant(c["status"])}>{c["status"]}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* correction dialog */}
      <Dialog open={Boolean(correctionDay)} onOpenChange={(o) => !o && setCorrectionDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attendance correction — {correctionDay && formatDate(correctionDay.date)}</DialogTitle>
            <DialogDescription>
              Current: {correctionDay?.status}
              {correctionDay?.checkInAt ? ` · in ${fmtTime(correctionDay.checkInAt)}` : ""}
              {correctionDay?.checkOutAt ? ` · out ${fmtTime(correctionDay.checkOutAt)}` : ""}.
              Your manager / HR will review this request.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Corrected check-in" htmlFor="cin">
              <Input id="cin" type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
            </FormField>
            <FormField label="Corrected check-out" htmlFor="cout">
              <Input id="cout" type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
            </FormField>
            <FormField label="Reason" htmlFor="creason" required className="col-span-2">
              <Textarea id="creason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Forgot to punch out — left at 6:45 PM" />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCorrectionDay(null)}>Cancel</Button>
            <Button
              disabled={reason.length < 5 || (!inTime && !outTime)}
              loading={requestCorrection.isPending}
              onClick={async () => {
                const date = correctionDay!.date;
                await requestCorrection.mutateAsync({
                  date,
                  requestedCheckIn: inTime ? `${date}T${inTime}:00` : undefined,
                  requestedCheckOut: outTime ? `${date}T${outTime}:00` : undefined,
                  reason,
                });
                setCorrectionDay(null);
              }}
            >
              Submit correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* admin self-edit (direct, no approval) */}
      {me?.employee && (
        <ManualMarkDialog
          open={Boolean(adminDay)}
          onOpenChange={(o) => !o && setAdminDay(null)}
          employee={{ id: me.employee.id, name: `${me.employee.firstName} ${me.employee.lastName}` }}
          date={adminDay?.date ?? ""}
          initial={adminDay ? { status: adminDay.status, checkInAt: adminDay.checkInAt, checkOutAt: adminDay.checkOutAt } : undefined}
        />
      )}
    </div>
  );
}

/* ---------- team tab ---------- */
const BULK_STATUSES = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "ON_LEAVE", label: "Leave" },
  { value: "WORK_FROM_HOME", label: "Work From Home" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "WEEK_OFF", label: "Week Off" },
];

function TeamTab() {
  const { can } = usePermissions();
  const canManage = can("attendance:manage");
  const [date, setDate] = React.useState(() => new Date().toLocaleDateString("en-CA"));
  const dayView = useDayView(date, true);
  const pending = usePendingCorrections(can("attendance:approve"));
  const decide = useDecideCorrection();
  const deleteAtt = useDeleteAttendance();
  const bulk = useBulkMark();
  const now = new Date();

  const [editRow, setEditRow] = React.useState<DayRow | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = React.useState("PRESENT");

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const counts = dayView.data?.counts;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" aria-label="Select date" />
        <div className="flex-1" />
        {canManage && (
          <ImportDialog type="attendance" title="Import attendance" onCompleted={() => dayView.refetch()}>
            <Button variant="secondary" size="sm"><Upload /> Import Excel</Button>
          </ImportDialog>
        )}
        {can("attendance:export") && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadAttendanceCsv(now.getFullYear(), now.getMonth() + 1).catch((err) => toast.error(apiErrorMessage(err)))}
          >
            <Download /> Export month
          </Button>
        )}
      </div>

      {/* bulk action bar */}
      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium text-text">{selected.size} selected</span>
          <Select value={bulkStatus} onValueChange={setBulkStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BULK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            loading={bulk.isPending}
            onClick={async () => {
              await bulk.mutateAsync({ employeeIds: [...selected], date, status: bulkStatus });
              setSelected(new Set());
            }}
          >
            Mark {selected.size} for {formatDate(date)}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Present", value: counts.present, accent: "text-success" },
            { label: "Late", value: counts.late, accent: "text-warning" },
            { label: "On leave", value: counts.onLeave, accent: "text-(--chart-6)" },
            { label: "Half day", value: counts.halfDay, accent: "text-warning" },
            { label: "Absent", value: counts.absent, accent: "text-danger" },
          ].map((card) => (
            <Card key={card.label} className="rounded-xl p-4">
              <p className={cn("text-xl font-semibold tabular-nums", card.accent)}>{card.value}</p>
              <p className="text-[11px] uppercase tracking-wide text-text-muted mt-0.5">{card.label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* pending corrections */}
      {can("attendance:approve") && (pending.data?.length ?? 0) > 0 && (
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><AlarmClockCheck className="size-4 text-warning" /> Corrections awaiting you</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {pending.data!.map((c) => (
              <div key={c["id"]} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar size="sm">
                    {c["requester"]?.photoUrl && <AvatarImage src={c["requester"].photoUrl} alt="" />}
                    <AvatarFallback>{initials(c["requester"]?.firstName, c["requester"]?.lastName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">
                      {c["requester"]?.firstName} {c["requester"]?.lastName}
                      <span className="ml-2 text-xs font-normal text-text-muted">{formatDate(c["attendance"]?.date)}</span>
                    </p>
                    <p className="text-xs text-text-muted line-clamp-1">
                      {c["requestedCheckIn"] && `In → ${fmtTime(c["requestedCheckIn"])} `}
                      {c["requestedCheckOut"] && `Out → ${fmtTime(c["requestedCheckOut"])} `}· {c["reason"]}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" loading={decide.isPending} onClick={() => decide.mutate({ id: c["id"], decision: "reject" })}>
                    <X className="text-danger" /> Reject
                  </Button>
                  <Button size="sm" loading={decide.isPending} onClick={() => decide.mutate({ id: c["id"], decision: "approve" })}>
                    <Check /> Approve
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* roster table */}
      {dayView.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : dayView.isError ? (
        <ErrorState message={apiErrorMessage(dayView.error)} onRetry={() => dayView.refetch()} />
      ) : !dayView.data?.rows.length ? (
        <EmptyState icon={Users} title="No team members in scope" />
      ) : (
        <Card className="rounded-xl overflow-hidden">
          <div className="overflow-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  {canManage && <th className="px-3 py-2.5 w-10"><input type="checkbox" className="size-4 accent-primary cursor-pointer" checked={selected.size === dayView.data.rows.length && selected.size > 0} onChange={(e) => setSelected(e.target.checked ? new Set(dayView.data!.rows.map((r) => r.employee.id)) : new Set())} aria-label="Select all" /></th>}
                  <th className="px-3 py-2.5 font-semibold">Employee</th>
                  <th className="px-3 py-2.5 font-semibold">Department</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Check In</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Check Out</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Hours</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Status</th>
                  {canManage && <th className="px-3 py-2.5 font-semibold w-12" />}
                </tr>
              </thead>
              <tbody>
                {dayView.data.rows.map((row) => (
                  <tr key={row.employee.id} className="border-t border-border hover:bg-surface-sunken/40">
                    {canManage && (
                      <td className="px-3 py-2.5">
                        <input type="checkbox" className="size-4 accent-primary cursor-pointer" checked={selected.has(row.employee.id)} onChange={() => toggle(row.employee.id)} aria-label={`Select ${row.employee.firstName}`} />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar size="sm">
                          {row.employee.photoUrl && <AvatarImage src={row.employee.photoUrl} alt="" />}
                          <AvatarFallback>{initials(row.employee.firstName, row.employee.lastName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium text-text truncate">{row.employee.firstName} {row.employee.lastName}</p>
                          <p className="text-[11px] text-text-faint truncate">{row.employee.employeeCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-text-muted">{row.employee.department?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{fmtTime(row.checkInAt)}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{fmtTime(row.checkOutAt)}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{row.workMinutes ? fmtHours(row.workMinutes) : "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex gap-1">
                        <Badge variant={statusVariant(row.status)}>{row.status.replace(/_/g, " ")}</Badge>
                        {row.isLate && <Badge variant="danger">Late</Badge>}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon-sm" aria-label="Edit attendance" onClick={() => setEditRow(row)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete attendance"
                            onClick={() => {
                              if (window.confirm(`Delete attendance record for ${row.employee.firstName} ${row.employee.lastName} on ${formatDate(date)}?`))
                                deleteAtt.mutate({ employeeId: row.employee.id, date });
                            }}
                          >
                            <Trash2 className="size-3.5 text-danger" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canManage && <ImportHistory type="attendance" title="Attendance import history" />}

      {editRow && (
        <ManualMarkDialog
          open={Boolean(editRow)}
          onOpenChange={(o) => !o && setEditRow(null)}
          employee={{ id: editRow.employee.id, name: `${editRow.employee.firstName} ${editRow.employee.lastName}` }}
          date={date}
          initial={{ status: editRow.status, checkInAt: editRow.checkInAt, checkOutAt: editRow.checkOutAt }}
        />
      )}
    </div>
  );
}

/* ---------- reports tab ---------- */
const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ReportsTab() {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState<number | undefined>(now.getMonth() + 1);
  const report = useAttendanceReport(year, month);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(month ?? "year")} onValueChange={(v) => setMonth(v === "year" ? undefined : Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="year">Full Year</SelectItem>
            {MONTH_NAMES.slice(1).map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => downloadAttendanceCsv(year, month).catch((err) => toast.error(apiErrorMessage(err)))}
        >
          <Download /> Download {month ? MONTH_NAMES[month] : "Yearly"} Report
        </Button>
      </div>

      {report.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : report.isError ? (
        <ErrorState message={apiErrorMessage(report.error)} onRetry={() => report.refetch()} />
      ) : !report.data?.rows.length ? (
        <EmptyState icon={Users} title="No attendance data" />
      ) : month ? (
        /* ---- monthly table ---- */
        <Card className="rounded-xl overflow-auto">
          <div className="scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Code</th>
                  <th className="px-3 py-2.5 font-semibold">Employee</th>
                  <th className="px-3 py-2.5 font-semibold">Department</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Working Days</th>
                  <th className="px-3 py-2.5 font-semibold text-center text-success">Present</th>
                  <th className="px-3 py-2.5 font-semibold text-center text-warning">Half Day</th>
                  <th className="px-3 py-2.5 font-semibold text-center text-danger">Absent</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Leave</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Late</th>
                  <th className="px-3 py-2.5 font-semibold text-center">Hours</th>
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((row) => {
                  const t = row.totals;
                  return (
                    <tr key={row.employee.id} className="border-t border-border hover:bg-surface-sunken/40">
                      <td className="px-3 py-2 tabular-nums text-text-muted">{row.employee.employeeCode}</td>
                      <td className="px-3 py-2 font-medium text-text">{row.employee.name}</td>
                      <td className="px-3 py-2 text-text-muted">{row.employee.department}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{t.workingDays}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-success font-medium">{t.present}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-warning font-medium">{t.halfDay}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-danger font-medium">{t.absent}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{t.onLeave}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{t.late}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{fmtHours(t.workMinutes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* ---- yearly table ---- */
        <Card className="rounded-xl overflow-auto">
          <div className="scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Code</th>
                  <th className="px-3 py-2.5 font-semibold">Employee</th>
                  <th className="px-3 py-2.5 font-semibold">Department</th>
                  {report.data.months.map((m) => (
                    <th key={m} className="px-2 py-2.5 font-semibold text-center" colSpan={3}>{MONTH_NAMES[m]}</th>
                  ))}
                  <th className="px-3 py-2.5 font-semibold text-center bg-surface-sunken" colSpan={3}>Total</th>
                </tr>
                <tr>
                  <th colSpan={3} />
                  {report.data.months.map((m) => (
                    <React.Fragment key={m}>
                      <th className="px-1 py-1 text-[9px] text-center text-success">P</th>
                      <th className="px-1 py-1 text-[9px] text-center text-danger">A</th>
                      <th className="px-1 py-1 text-[9px] text-center">L</th>
                    </React.Fragment>
                  ))}
                  <th className="px-1 py-1 text-[9px] text-center text-success bg-surface-sunken">P</th>
                  <th className="px-1 py-1 text-[9px] text-center text-danger bg-surface-sunken">A</th>
                  <th className="px-1 py-1 text-[9px] text-center bg-surface-sunken">L</th>
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((row) => (
                  <tr key={row.employee.id} className="border-t border-border hover:bg-surface-sunken/40">
                    <td className="px-3 py-2 tabular-nums text-text-muted">{row.employee.employeeCode}</td>
                    <td className="px-3 py-2 font-medium text-text whitespace-nowrap">{row.employee.name}</td>
                    <td className="px-3 py-2 text-text-muted">{row.employee.department}</td>
                    {report.data!.months.map((m) => {
                      const s = row.monthly[String(m)];
                      return (
                        <React.Fragment key={m}>
                          <td className="px-1 py-2 text-center tabular-nums text-success">{s?.present ?? 0}</td>
                          <td className="px-1 py-2 text-center tabular-nums text-danger">{s?.absent ?? 0}</td>
                          <td className="px-1 py-2 text-center tabular-nums">{s?.onLeave ?? 0}</td>
                        </React.Fragment>
                      );
                    })}
                    <td className="px-1 py-2 text-center tabular-nums text-success font-semibold bg-surface-sunken/40">{row.totals.present}</td>
                    <td className="px-1 py-2 text-center tabular-nums text-danger font-semibold bg-surface-sunken/40">{row.totals.absent}</td>
                    <td className="px-1 py-2 text-center tabular-nums font-semibold bg-surface-sunken/40">{row.totals.onLeave}</td>
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

/* ---------- page ---------- */
export function AttendancePage() {
  const { can } = usePermissions();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Attendance</h1>
        <p className="text-sm text-text-muted">Punch in, track your hours, and request corrections.</p>
      </div>
      <PunchCard />
      {can("attendance:read_all") ? (
        <Tabs defaultValue="me">
          <TabsList>
            <TabsTrigger value="me"><Clock3 /> My Attendance</TabsTrigger>
            <TabsTrigger value="team"><Users /> Team</TabsTrigger>
            <TabsTrigger value="reports"><BarChart3 /> Reports</TabsTrigger>
          </TabsList>
          <TabsContent value="me"><MyAttendanceTab /></TabsContent>
          <TabsContent value="team"><TeamTab /></TabsContent>
          <TabsContent value="reports"><ReportsTab /></TabsContent>
        </Tabs>
      ) : (
        <MyAttendanceTab />
      )}
    </div>
  );
}
