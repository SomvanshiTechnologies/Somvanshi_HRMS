import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlarmClockCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Download,
  LogIn,
  LogOut,
  Pencil,
  Users,
  X,
} from "lucide-react";
import {
  downloadAttendanceCsv,
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
  type MonthDay,
} from "./useAttendance";
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
const STATUS_DOT: Record<string, string> = {
  PRESENT: "bg-success",
  WORK_FROM_HOME: "bg-(--chart-3)",
  HALF_DAY: "bg-warning",
  ON_LEAVE: "bg-(--chart-6)",
  ABSENT: "bg-danger",
  HOLIDAY: "bg-info",
  WEEK_OFF: "bg-border-strong",
  FUTURE: "bg-transparent",
};

function MonthCalendar({
  month, year, days, onPrev, onNext, onDayClick,
}: {
  month: number; year: number; days: MonthDay[];
  onPrev: () => void; onNext: () => void;
  onDayClick?: (day: MonthDay) => void;
}) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const label = new Date(year, month - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
  return (
    <Card className="rounded-xl">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">{label}</CardTitle>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="icon-sm" onClick={onPrev} aria-label="Previous month"><ChevronLeft /></Button>
          <Button variant="secondary" size="icon-sm" onClick={onNext} aria-label="Next month"><ChevronRight /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-text-faint mb-1.5">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: firstDow }).map((_, i) => <span key={`pad-${i}`} />)}
          {days.map((day) => {
            const num = Number(day.date.slice(-2));
            const isToday = day.date === new Date().toLocaleDateString("en-CA");
            return (
              <button
                key={day.date}
                onClick={onDayClick ? () => onDayClick(day) : undefined}
                title={`${day.status}${day.isLate ? " · late" : ""}${day.workMinutes ? ` · ${fmtHours(day.workMinutes)}` : ""}`}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border border-transparent py-2 text-sm transition-colors",
                  onDayClick && "cursor-pointer hover:bg-surface-sunken",
                  isToday && "border-primary/40 bg-primary/5 font-semibold"
                )}
              >
                <span className={cn("tabular-nums", day.status === "FUTURE" ? "text-text-faint" : "text-text")}>{num}</span>
                <span className={cn("size-1.5 rounded-full", STATUS_DOT[day.status] ?? "bg-border")} aria-hidden />
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-text-muted">
          {[["Present", "PRESENT"], ["Half day", "HALF_DAY"], ["Leave", "ON_LEAVE"], ["Absent", "ABSENT"], ["Holiday", "HOLIDAY"], ["Week off", "WEEK_OFF"]].map(([label_, key]) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", STATUS_DOT[key!])} /> {label_}
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
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const monthData = useMyMonth(month, year);
  const corrections = useMyCorrections();
  const requestCorrection = useRequestCorrection();
  const [correctionDay, setCorrectionDay] = React.useState<MonthDay | null>(null);
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
              onPrev={() => shift(-1)} onNext={() => shift(1)}
              onDayClick={(day) => {
                if (day.status === "FUTURE" || day.status === "WEEK_OFF" || day.status === "HOLIDAY") return;
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
    </div>
  );
}

/* ---------- team tab ---------- */
function TeamTab() {
  const { can } = usePermissions();
  const [date, setDate] = React.useState(() => new Date().toLocaleDateString("en-CA"));
  const dayView = useDayView(date, true);
  const pending = usePendingCorrections(can("attendance:approve"));
  const decide = useDecideCorrection();
  const now = new Date();

  const counts = dayView.data?.counts;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" aria-label="Select date" />
        <div className="flex-1" />
        {can("attendance:export") && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadAttendanceCsv(now.getMonth() + 1, now.getFullYear()).catch((err) => toast.error(apiErrorMessage(err)))}
          >
            <Download /> Export month
          </Button>
        )}
      </div>

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

      {/* roster */}
      {dayView.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : dayView.isError ? (
        <ErrorState message={apiErrorMessage(dayView.error)} onRetry={() => dayView.refetch()} />
      ) : !dayView.data?.rows.length ? (
        <EmptyState icon={Users} title="No team members in scope" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {dayView.data.rows.map((row) => (
            <Card key={row.employee.id} className="rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar size="sm">
                  {row.employee.photoUrl && <AvatarImage src={row.employee.photoUrl} alt="" />}
                  <AvatarFallback>{initials(row.employee.firstName, row.employee.lastName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">
                    {row.employee.firstName} {row.employee.lastName}
                  </p>
                  <p className="text-[11px] text-text-muted truncate">
                    {fmtTime(row.checkInAt)} → {fmtTime(row.checkOutAt)}
                    {row.workMinutes ? ` · ${fmtHours(row.workMinutes)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant={statusVariant(row.status)}>{row.status.replace(/_/g, " ")}</Badge>
                {row.isLate && <Badge variant="danger" className="text-[10px]">Late</Badge>}
              </div>
            </Card>
          ))}
        </div>
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
          </TabsList>
          <TabsContent value="me"><MyAttendanceTab /></TabsContent>
          <TabsContent value="team"><TeamTab /></TabsContent>
        </Tabs>
      ) : (
        <MyAttendanceTab />
      )}
    </div>
  );
}
