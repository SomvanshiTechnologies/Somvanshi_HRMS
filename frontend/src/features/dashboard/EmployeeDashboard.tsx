import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight, Banknote, CalendarCheck2, CalendarDays, Cake, ClipboardList,
  LifeBuoy, Megaphone, PartyPopper,
} from "lucide-react";
import { useToday } from "@/features/attendance/useAttendance";
import { useMyBalances } from "@/features/leave/useLeave";
import { useMyPayslips, MONTHS } from "@/features/payroll/usePayroll";
import { useEodByDate } from "@/features/eod/useEod";
import { useHolidays, useCelebrations } from "./useDashboard";
import { useFeed } from "@/features/feed/useFeed";
import { useAuthStore } from "@/stores/auth";
import { cn, compactINR, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
const ISO_TODAY = new Date().toISOString().slice(0, 10);

function Stat({ icon: Icon, label, value, sub, accent, to }: { icon: typeof Banknote; label: string; value: React.ReactNode; sub?: string; accent: string; to?: string }) {
  const body = (
    <Card className="rounded-xl p-4 flex items-center gap-3 hover:shadow-raised transition-shadow h-full">
      <div className={cn("rounded-lg p-2.5", accent)}><Icon className="size-5" /></div>
      <div className="min-w-0">
        <p className="text-lg font-semibold text-text tabular-nums leading-tight">{value}</p>
        <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
        {sub && <p className="text-[11px] text-text-faint">{sub}</p>}
      </div>
    </Card>
  );
  return to ? <Link to={to} className="contents">{body}</Link> : body;
}

/** Personal, self-service dashboard for non-leadership employees. */
export function EmployeeDashboard() {
  const user = useAuthStore((s) => s.user);
  const emp = user?.employee;
  const today = useToday();
  const balances = useMyBalances();
  const payslips = useMyPayslips();
  const eod = useEodByDate(ISO_TODAY);
  const holidays = useHolidays();
  const celebrations = useCelebrations();
  const feed = useFeed();

  const rec = today.data?.record as { checkInAt?: string | null; checkOutAt?: string | null; status?: string } | null | undefined;
  const punchLabel = !rec?.checkInAt ? "Not checked in" : rec.checkOutAt ? "Checked out" : "Checked in";
  const totalLeave = (balances.data ?? []).reduce((t, b) => t + (b.available ?? 0), 0);
  const latest = payslips.data?.[0];
  const upcomingHolidays = (holidays.data ?? []).filter((h) => new Date(h.date) >= new Date(new Date().toDateString())).slice(0, 4);
  const eodDone = eod.data && eod.data.status !== "DRAFT";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_19rem] gap-5">
      <div className="space-y-5 min-w-0">
        {/* welcome */}
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-xl bg-gradient-to-br from-secondary via-primary to-(--chart-2) p-6 lg:p-7 text-white shadow-raised">
          <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: "radial-gradient(40rem 20rem at 85% -20%, #63b0cd 0%, transparent 55%)" }} aria-hidden />
          <div className="relative z-10 flex items-center gap-4">
            <Avatar size="lg" className="ring-2 ring-white/30">{emp?.photoUrl && <AvatarImage src={emp.photoUrl} alt="" />}<AvatarFallback className="bg-white/15 text-white">{initials(emp?.firstName, emp?.lastName)}</AvatarFallback></Avatar>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{greeting()}{emp?.firstName ? `, ${emp.firstName}` : ""}</h1>
              <p className="mt-0.5 text-sm text-white/70">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{emp?.designation?.title ? ` · ${emp.designation.title}` : ""}</p>
            </div>
          </div>
        </motion.section>

        {/* personal stats */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={CalendarCheck2} label="Today" value={today.isLoading ? <Skeleton className="h-6 w-20" /> : punchLabel} accent={rec?.checkInAt ? "bg-success-bg text-success" : "bg-surface-sunken text-text-muted"} to="/attendance" />
          <Stat icon={CalendarDays} label="Leave available" value={balances.isLoading ? <Skeleton className="h-6 w-10" /> : `${totalLeave}d`} sub="across all types" accent="bg-info-bg text-info" to="/leave" />
          <Stat icon={Banknote} label="Latest payslip" value={latest ? compactINR(Number(latest.netPay)) : "—"} sub={latest ? `${MONTHS[latest.month - 1]} ${latest.year}` : "none yet"} accent="bg-primary/10 text-primary dark:text-chart-3" to="/payslips" />
          <Stat icon={ClipboardList} label="Today's EOD" value={eod.isLoading ? <Skeleton className="h-6 w-16" /> : eodDone ? "Submitted" : "Pending"} accent={eodDone ? "bg-success-bg text-success" : "bg-warning-bg text-warning"} to="/eod" />
        </section>

        {/* leave balances + payslips */}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="rounded-xl p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-text">My leave balances</h2><Button asChild variant="ghost" size="sm"><Link to="/leave">Apply <ArrowRight className="size-3.5" /></Link></Button></div>
            {balances.isLoading ? <Skeleton className="h-24 rounded-lg" /> : !balances.data?.length ? <p className="text-sm text-text-faint">No leave types configured.</p> : (
              <div className="grid grid-cols-2 gap-2.5">
                {balances.data.slice(0, 6).map((b) => (
                  <div key={b.leaveType.id} className="rounded-lg border border-border p-3">
                    <p className="text-lg font-semibold text-text tabular-nums">{b.available}</p>
                    <p className="text-[11px] text-text-muted truncate">{b.leaveType.name}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="rounded-xl p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-text">Recent payslips</h2><Button asChild variant="ghost" size="sm"><Link to="/payslips">All <ArrowRight className="size-3.5" /></Link></Button></div>
            {payslips.isLoading ? <Skeleton className="h-24 rounded-lg" /> : !payslips.data?.length ? <p className="text-sm text-text-faint">No payslips published yet.</p> : (
              <div className="space-y-2">
                {payslips.data.slice(0, 3).map((s) => (
                  <Link key={s.id} to="/payslips" className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 hover:bg-surface-sunken transition-colors">
                    <span className="text-sm text-text">{MONTHS[s.month - 1]} {s.year}</span>
                    <span className="text-sm font-semibold text-text tabular-nums">{compactINR(Number(s.netPay))}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* announcements */}
        <Card className="rounded-xl p-5">
          <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-text flex items-center gap-2"><Megaphone className="size-4 text-primary dark:text-chart-3" /> Company feed</h2><Button asChild variant="ghost" size="sm"><Link to="/feed">Open <ArrowRight className="size-3.5" /></Link></Button></div>
          {feed.isLoading ? <Skeleton className="h-16 rounded-lg" /> : !feed.data?.length ? <p className="text-sm text-text-faint">No announcements yet.</p> : (
            <div className="space-y-2">
              {feed.data.slice(0, 3).map((a) => (
                <Link key={a.id} to="/feed" className="block rounded-lg border border-border px-3 py-2.5 hover:bg-surface-sunken transition-colors">
                  <p className="text-sm font-medium text-text truncate">{a.title}</p>
                  <p className="text-xs text-text-muted line-clamp-1">{a.body}</p>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ============ RIGHT RAIL ============ */}
      <aside className="space-y-5">
        <Card className="rounded-xl p-5">
          <h2 className="font-semibold text-text flex items-center gap-2 mb-3"><CalendarDays className="size-4 text-primary dark:text-chart-3" /> Upcoming holidays</h2>
          {holidays.isLoading ? <Skeleton className="h-16 rounded-lg" /> : !upcomingHolidays.length ? <p className="text-sm text-text-faint">No upcoming holidays.</p> : (
            <div className="space-y-2">
              {upcomingHolidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm">
                  <span className="text-text truncate">{h.name}</span>
                  <span className="text-[11px] text-text-faint shrink-0">{formatDate(h.date)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="rounded-xl p-5">
          <h2 className="font-semibold text-text flex items-center gap-2 mb-3"><PartyPopper className="size-4 text-success" /> Celebrations</h2>
          {celebrations.isLoading ? <Skeleton className="h-16 rounded-lg" /> : (
            <div className="space-y-2 text-sm">
              {(celebrations.data?.birthdays ?? []).slice(0, 4).map((b) => (
                <div key={b.id} className="flex items-center gap-2"><Cake className="size-3.5 text-warning shrink-0" /><span className="text-text truncate">{b.firstName} {b.lastName}</span><span className="ml-auto text-[11px] text-text-faint">{b.isToday ? "Today" : formatDate(b.date)}</span></div>
              ))}
              {(celebrations.data?.anniversaries ?? []).slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-center gap-2"><PartyPopper className="size-3.5 text-success shrink-0" /><span className="text-text truncate">{a.firstName} {a.lastName}</span><Badge variant="success" className="ml-auto">{a.years}y</Badge></div>
              ))}
              {!(celebrations.data?.birthdays.length || celebrations.data?.anniversaries.length) && <p className="text-text-faint">Nothing this week.</p>}
            </div>
          )}
        </Card>

        <Card className="rounded-xl p-5">
          <h2 className="font-semibold text-text flex items-center gap-2 mb-3"><LifeBuoy className="size-4 text-primary dark:text-chart-3" /> Quick links</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Link to="/leave" className="rounded-lg border border-border px-3 py-2 text-center hover:bg-surface-sunken transition-colors">Apply leave</Link>
            <Link to="/helpdesk" className="rounded-lg border border-border px-3 py-2 text-center hover:bg-surface-sunken transition-colors">Raise ticket</Link>
            <Link to="/eod" className="rounded-lg border border-border px-3 py-2 text-center hover:bg-surface-sunken transition-colors">Submit EOD</Link>
            <Link to="/profile" className="rounded-lg border border-border px-3 py-2 text-center hover:bg-surface-sunken transition-colors">My profile</Link>
          </div>
        </Card>
      </aside>
    </div>
  );
}
