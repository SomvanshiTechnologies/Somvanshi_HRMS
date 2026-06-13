import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  Bell,
  Briefcase,
  Cake,
  CalendarCheck2,
  CalendarDays,
  CalendarX2,
  ClipboardCheck,
  PartyPopper,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { useNotifications } from "@/features/notifications/useNotifications";
import { apiErrorMessage } from "@/lib/api";
import { compactINR, cn, formatDate, formatDateTime, initials } from "@/lib/utils";
import {
  useAttritionTrend,
  useCelebrations,
  useDepartmentAnalytics,
  useHeadcountTrend,
  useHolidays,
  useOverview,
  type CelebrationPerson,
} from "./useDashboard";
import { ChartCard } from "@/components/chart-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";

const chartStroke = "var(--color-border)";
const tickStyle = { fill: "var(--color-text-faint)", fontSize: 11 };
const tooltipStyle = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--color-text)",
};

/* ---------- celebration widgets ---------- */
function PersonRow({ person, suffix }: { person: CelebrationPerson; suffix: React.ReactNode }) {
  return (
    <Link
      to={`/employees/${person.id}`}
      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-sunken transition-colors"
    >
      <Avatar size="sm">
        {person.photoUrl && <AvatarImage src={person.photoUrl} alt="" />}
        <AvatarFallback>{initials(person.firstName, person.lastName)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-text truncate">
          {person.firstName} {person.lastName}
        </span>
        <span className="block text-[11px] text-text-muted truncate">
          {person.designation ?? "—"}
          {person.department ? ` · ${person.department}` : ""}
        </span>
      </span>
      {suffix}
    </Link>
  );
}

function CelebrationsRow() {
  const celebrations = useCelebrations();
  const data = celebrations.data;
  if (celebrations.isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  }
  if (!data || (!data.birthdays.length && !data.anniversaries.length)) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {data.birthdays.length > 0 && (
        <Card className="rounded-xl p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-lg bg-warning-bg p-2 text-warning">
              <Cake className="size-4" />
            </span>
            <h3 className="text-sm font-semibold text-text">Birthdays</h3>
          </div>
          <div className="space-y-0.5">
            {data.birthdays.slice(0, 4).map((b) => (
              <PersonRow
                key={b.id}
                person={b}
                suffix={
                  b.isToday ? (
                    <Badge variant="warning">🎂 Today</Badge>
                  ) : (
                    <span className="text-[11px] text-text-faint shrink-0">{formatDate(b.date)}</span>
                  )
                }
              />
            ))}
          </div>
        </Card>
      )}
      {data.anniversaries.length > 0 && (
        <Card className="rounded-xl p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-lg bg-success-bg p-2 text-success">
              <PartyPopper className="size-4" />
            </span>
            <h3 className="text-sm font-semibold text-text">Work Anniversaries</h3>
          </div>
          <div className="space-y-0.5">
            {data.anniversaries.slice(0, 4).map((a) => (
              <PersonRow
                key={a.id}
                person={a}
                suffix={
                  <Badge variant={a.isToday ? "success" : "default"}>
                    🎉 {a.years} {a.years === 1 ? "year" : "years"}
                  </Badge>
                }
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------- page ---------- */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { can } = usePermissions();
  const overview = useOverview();
  const headcount = useHeadcountTrend();
  const attrition = useAttritionTrend();
  const departments = useDepartmentAnalytics();
  const holidays = useHolidays();
  const celebrations = useCelebrations();
  const { list: notifications, unreadCount } = useNotifications();

  const firstName = user?.employee?.firstName ?? "";
  const o = overview.data;
  const emp = user?.employee;

  const hc = headcount.data ?? [];
  const lastTwo = hc.slice(-2);
  const headcountDelta =
    lastTwo.length === 2 && lastTwo[0]!.headcount > 0
      ? Math.round(((lastTwo[1]!.headcount - lastTwo[0]!.headcount) / lastTwo[0]!.headcount) * 1000) / 10
      : null;
  const topGrowthDept = (departments.data ?? []).reduce<{ name: string; newThisMonth: number } | null>(
    (best, d) => (d.newThisMonth > (best?.newThisMonth ?? 0) ? { name: d.name, newThisMonth: d.newThisMonth } : best),
    null
  );

  const upcomingHolidays = (holidays.data ?? [])
    .filter((h) => new Date(h.date) >= new Date(new Date().toDateString()))
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_19rem] gap-5">
      {/* ================= MAIN COLUMN ================= */}
      <div className="space-y-5 min-w-0">
        {/* welcome banner */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-xl bg-gradient-to-br from-secondary via-primary to-(--chart-2) p-6 lg:p-7 text-white shadow-raised"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{ background: "radial-gradient(40rem 20rem at 85% -20%, #63b0cd 0%, transparent 55%)" }}
            aria-hidden
          />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-center gap-4">
              <Avatar size="lg" className="ring-2 ring-white/30">
                {emp?.photoUrl && <AvatarImage src={emp.photoUrl} alt="" />}
                <AvatarFallback className="bg-white/15 text-white">{initials(emp?.firstName, emp?.lastName)}</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {greeting()}{firstName ? `, ${firstName}` : ""}
                </h1>
                <p className="mt-0.5 text-sm text-white/70">
                  {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  {emp?.designation?.title ? ` · ${emp.designation.title}` : ""}
                </p>
              </div>
            </div>
            {can("employees:create") && (
              <Button asChild variant="secondary" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                <Link to="/employees/new">
                  <Plus /> Add Employee
                </Link>
              </Button>
            )}
          </div>

          {/* today chips */}
          <div className="relative z-10 mt-5 flex flex-wrap gap-2.5">
            {overview.isLoading || !o ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-40 bg-white/10" />)
            ) : (
              <>
                <BannerChip icon={Users} value={o.activeEmployees} label="active people" />
                <BannerChip icon={CalendarCheck2} value={o.presentToday} label="present today" tone="success" />
                <BannerChip icon={CalendarX2} value={o.onLeaveToday} label="on leave" tone="warning" />
                {can("leave:approve") && (
                  <Link to="/leave/approvals" className="contents">
                    <BannerChip
                      icon={ClipboardCheck}
                      value={o.pendingLeaveRequests}
                      label="pending approvals"
                      tone={o.pendingLeaveRequests > 0 ? "danger" : "default"}
                    />
                  </Link>
                )}
              </>
            )}
          </div>
        </motion.section>

        {/* celebrations */}
        <CelebrationsRow />

        {/* KPI cards */}
        {overview.isError ? (
          <ErrorState message={apiErrorMessage(overview.error)} onRetry={() => overview.refetch()} />
        ) : (
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: "Workforce", icon: Users, value: o?.totalEmployees, hint: `${o?.newJoinersThisMonth ?? 0} joined this month`, trend: headcountDelta, to: "/employees", show: true },
              { label: "New Joiners", icon: UserPlus, value: o?.newJoinersThisMonth, hint: "this month", to: "/employees", show: true },
              { label: "Attrition (YTD)", icon: TrendingDown, value: o != null ? `${o.attritionRate}%` : undefined, hint: "year to date", show: true },
              { label: "Payroll Cost", icon: Wallet, value: o != null ? compactINR(o.payrollCostLastMonth) : undefined, hint: "last month · net", show: can("payroll:read_all") },
              { label: "Open Positions", icon: Briefcase, value: o?.openPositions, hint: "actively hiring", show: !can("payroll:read_all") },
            ]
              .filter((c) => c.show)
              .slice(0, 4)
              .map((card, i) => (
                <motion.div key={card.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="rounded-xl p-5 hover:shadow-raised transition-shadow h-full">
                    <div className="flex items-start justify-between">
                      <div className="rounded-lg bg-primary/10 p-2.5 text-primary dark:text-chart-3">
                        <card.icon className="size-5" />
                      </div>
                      {card.trend != null && (
                        <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", card.trend >= 0 ? "text-success" : "text-danger")}>
                          {card.trend >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                          {Math.abs(card.trend)}%
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-2xl font-semibold text-text tabular-nums">
                      {overview.isLoading ? <Skeleton className="h-8 w-20" /> : card.value ?? "—"}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {card.label} · {card.hint}
                    </p>
                    {card.to && (
                      <Link to={card.to} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline dark:text-chart-3">
                        View <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </Card>
                </motion.div>
              ))}
          </section>
        )}

        {/* trends */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            title="Headcount Trend"
            description="Month-end headcount"
            isLoading={headcount.isLoading}
            error={headcount.isError ? headcount.error : undefined}
            errorMessage={headcount.isError ? apiErrorMessage(headcount.error) : undefined}
            onRetry={() => headcount.refetch()}
            height={210}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hc} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hcFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chartStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <ChartTooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="headcount" name="Headcount" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#hcFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Hiring vs Exits"
            description="Monthly movement"
            isLoading={headcount.isLoading}
            error={headcount.isError ? headcount.error : undefined}
            errorMessage={headcount.isError ? apiErrorMessage(headcount.error) : undefined}
            onRetry={() => headcount.refetch()}
            height={210}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hc} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={chartStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={tickStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <ChartTooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-surface-sunken)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="joiners" name="Joiners" fill="var(--color-chart-5)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="exits" name="Exits" fill="var(--color-chart-4)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Attrition Trend"
            description="Monthly attrition %"
            isLoading={attrition.isLoading}
            error={attrition.isError ? attrition.error : undefined}
            errorMessage={attrition.isError ? apiErrorMessage(attrition.error) : undefined}
            onRetry={() => attrition.refetch()}
            height={210}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attrition.data ?? []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={chartStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis tick={tickStyle} axisLine={false} tickLine={false} unit="%" />
                <ChartTooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="attritionPct" name="Attrition %" stroke="var(--color-danger)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card className="rounded-xl p-5">
            <h3 className="text-sm font-semibold text-text mb-3">Departments</h3>
            {departments.isLoading ? (
              <Skeleton className="h-36 w-full" />
            ) : !departments.data?.length ? (
              <p className="text-sm text-text-faint">No departments yet.</p>
            ) : (
              <ul className="space-y-2">
                {departments.data
                  .slice()
                  .sort((a, b) => b.headcount - a.headcount)
                  .slice(0, 6)
                  .map((d) => {
                    const max = Math.max(...departments.data!.map((x) => x.headcount), 1);
                    return (
                      <li key={d.id}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-text">{d.name}</span>
                          <span className="text-text-muted tabular-nums">
                            {d.headcount}
                            {d.newThisMonth > 0 && <span className="text-success"> (+{d.newThisMonth})</span>}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-primary to-(--chart-2)" style={{ width: `${(d.headcount / max) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Card>
        </section>
      </div>

      {/* ================= RIGHT RAIL ================= */}
      <aside className="space-y-4 min-w-0">
        {/* notifications */}
        <Card className="rounded-xl p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-info-bg p-2 text-info">
                <Bell className="size-4" />
              </span>
              <h3 className="text-sm font-semibold text-text">Notifications</h3>
            </div>
            {unreadCount > 0 && <Badge variant="danger">{unreadCount}</Badge>}
          </div>
          {!notifications.data?.data.length ? (
            <p className="text-sm text-text-faint px-1">You're all caught up.</p>
          ) : (
            <ul className="space-y-2.5">
              {notifications.data.data.slice(0, 5).map((n) => (
                <li key={n.id} className="text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                  <p className={cn("text-text leading-snug text-[13px]", !n.isRead && "font-medium")}>{n.title}</p>
                  <p className="text-[11px] text-text-faint">{formatDateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* upcoming events */}
        <Card className="rounded-xl p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="rounded-lg bg-primary/10 p-2 text-primary dark:text-chart-3">
              <CalendarDays className="size-4" />
            </span>
            <h3 className="text-sm font-semibold text-text">Upcoming Events</h3>
          </div>
          {holidays.isLoading || celebrations.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ul className="space-y-2">
              {upcomingHolidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-text truncate">🗓️ {h.name}</span>
                  <span className="text-[11px] text-text-faint shrink-0">{formatDate(h.date)}</span>
                </li>
              ))}
              {(celebrations.data?.birthdays ?? []).slice(0, 3).map((b) => (
                <li key={`b-${b.id}`} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-text truncate">
                    🎂 {b.firstName} {b.lastName}
                  </span>
                  <span className="text-[11px] text-text-faint shrink-0">{b.isToday ? "Today" : formatDate(b.date)}</span>
                </li>
              ))}
              {(celebrations.data?.anniversaries ?? []).slice(0, 3).map((a) => (
                <li key={`a-${a.id}`} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-text truncate">
                    🎉 {a.firstName} {a.lastName} · {a.years}y
                  </span>
                  <span className="text-[11px] text-text-faint shrink-0">{a.isToday ? "Today" : formatDate(a.date)}</span>
                </li>
              ))}
              {!upcomingHolidays.length && !celebrations.data?.birthdays.length && !celebrations.data?.anniversaries.length && (
                <p className="text-sm text-text-faint">No upcoming events. HR can add holidays under Leave Management.</p>
              )}
            </ul>
          )}
        </Card>

        {/* AI suggestions / insights */}
        <Card className="rounded-xl p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="rounded-lg bg-primary/10 p-2 text-primary dark:text-chart-3">
              <Sparkles className="size-4" />
            </span>
            <h3 className="text-sm font-semibold text-text">Insights</h3>
          </div>
          <ul className="space-y-2.5 text-[13px]">
            {headcount.isLoading || departments.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                {headcountDelta != null && headcountDelta !== 0 && (
                  <li className="flex gap-2 text-text-muted">
                    <span className={cn("mt-1 size-1.5 rounded-full shrink-0", headcountDelta >= 0 ? "bg-success" : "bg-danger")} />
                    <span>
                      Headcount {headcountDelta >= 0 ? "grew" : "shrank"} <strong className="text-text">{Math.abs(headcountDelta)}%</strong> month-over-month.
                    </span>
                  </li>
                )}
                {topGrowthDept && topGrowthDept.newThisMonth > 0 && (
                  <li className="flex gap-2 text-text-muted">
                    <span className="mt-1 size-1.5 rounded-full bg-success shrink-0" />
                    <span>
                      <strong className="text-text">{topGrowthDept.name}</strong> is growing fastest — {topGrowthDept.newThisMonth} new this month.
                    </span>
                  </li>
                )}
                {o && o.pendingLeaveRequests > 0 && can("leave:approve") && (
                  <li className="flex gap-2 text-text-muted">
                    <span className="mt-1 size-1.5 rounded-full bg-warning shrink-0" />
                    <span>
                      <strong className="text-text">{o.pendingLeaveRequests}</strong> leave {o.pendingLeaveRequests === 1 ? "request" : "requests"} awaiting action.
                    </span>
                  </li>
                )}
                <li className="flex gap-2 text-text-faint">
                  <span className="mt-1 size-1.5 rounded-full bg-border-strong shrink-0" />
                  Sera-powered suggestions arrive with the AI phase.
                </li>
              </>
            )}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

function BannerChip({
  icon: Icon,
  value,
  label,
  tone = "default",
}: {
  icon: typeof Users;
  value: string | number;
  label: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones = {
    default: "bg-white/10",
    success: "bg-success/20",
    warning: "bg-warning/25",
    danger: "bg-danger/25",
  };
  return (
    <div className={cn("flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-white backdrop-blur", tones[tone])}>
      <Icon className="size-4 opacity-80" aria-hidden />
      <span className="text-lg font-semibold tabular-nums leading-none">{value}</span>
      <span className="text-xs opacity-80 leading-tight">{label}</span>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
