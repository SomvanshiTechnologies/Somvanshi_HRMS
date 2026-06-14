import * as React from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList,
  Legend, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";
import { Briefcase, CalendarCheck2, Download, TrendingDown, UserPlus, Users, Wallet } from "lucide-react";
import {
  exportSeriesCsv, useAttendanceTrend, useHiringFunnel, useHiringTrend, useLeaveTrends, usePayrollTrend,
} from "./useReports";
import { useAttritionTrend, useDepartmentAnalytics, useHeadcountTrend, useOverview } from "@/features/dashboard/useDashboard";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { compactINR } from "@/lib/utils";
import { ChartCard } from "@/components/chart-card";
import { KpiCard } from "@/components/kpi-card";
import { KpiSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const stroke = "var(--color-border)";
const tick = { fill: "var(--color-text-faint)", fontSize: 11 };
const tip = { backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12, color: "var(--color-text)" };
const PALETTE = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-chart-6)", "var(--color-danger)"];

export function ReportsPage() {
  const { can } = usePermissions();
  const canPayroll = can("payroll:read_all", "analytics:read_all");
  const [months, setMonths] = React.useState(6);

  const overview = useOverview();
  const headcount = useHeadcountTrend(months);
  const attrition = useAttritionTrend(months);
  const departments = useDepartmentAnalytics();
  const leaveTrends = useLeaveTrends(months);
  const hiringFunnel = useHiringFunnel();
  const hiringTrend = useHiringTrend(months);
  const attendanceTrend = useAttendanceTrend(months);
  const payrollTrend = usePayrollTrend(months, canPayroll);

  const o = overview.data;
  const funnelData = (hiringFunnel.data ?? []).map((f, i) => ({ name: f.stage, value: f.count, fill: PALETTE[i % PALETTE.length] }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Reports & Analytics</h1>
          <p className="text-sm text-text-muted">Executive insights — every figure computed live from your data.</p>
        </div>
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="w-36 h-9" aria-label="Time range"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[3, 6, 12, 24].map((m) => <SelectItem key={m} value={String(m)}>Last {m} months</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPI row */}
      {overview.isError ? (
        <ErrorState message={apiErrorMessage(overview.error)} onRetry={() => overview.refetch()} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {overview.isLoading || !o ? <KpiSkeleton count={4} /> : (
            <>
              <KpiCard label="Total Employees" value={o.totalEmployees} icon={Users} hint={`${o.activeEmployees} active`} />
              <KpiCard label="New Joiners" value={o.newJoinersThisMonth} icon={UserPlus} hint="this month" accent="success" />
              <KpiCard label="Attrition (YTD)" value={`${o.attritionRate}%`} icon={TrendingDown} hint="year to date" accent={o.attritionRate > 15 ? "danger" : "warning"} />
              {canPayroll
                ? <KpiCard label="Payroll Cost" value={compactINR(o.payrollCostLastMonth)} icon={Wallet} hint="last month · net" accent="info" />
                : <KpiCard label="Open Positions" value={o.openPositions} icon={Briefcase} hint="hiring" accent="info" />}
            </>
          )}
        </div>
      )}

      {/* headcount + attrition */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="Headcount Trend" description="Month-end headcount"
          isLoading={headcount.isLoading} error={headcount.error} onRetry={() => headcount.refetch()}
          action={<Button variant="ghost" size="icon-sm" aria-label="Export" onClick={() => exportSeriesCsv("headcount.csv", headcount.data ?? [])}><Download /></Button>}
        >
          <ResponsiveContainer width="100%" height={280} minWidth={0}>
            <AreaChart data={headcount.data ?? []} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <defs><linearGradient id="rhc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid stroke={stroke} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} /><YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
              <ChartTooltip contentStyle={tip} />
              <Area type="monotone" dataKey="headcount" name="Headcount" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#rhc)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Attrition Trend" description="Monthly attrition %" isLoading={attrition.isLoading} error={attrition.error} onRetry={() => attrition.refetch()}>
          <ResponsiveContainer width="100%" height={280} minWidth={0}>
            <LineChart data={attrition.data ?? []} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={stroke} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} /><YAxis tick={tick} axisLine={false} tickLine={false} unit="%" />
              <ChartTooltip contentStyle={tip} />
              <Line type="monotone" dataKey="attritionPct" name="Attrition %" stroke="var(--color-danger)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* attendance composition */}
        <ChartCard title="Attendance Composition" description="Monthly present / leave / absent" isLoading={attendanceTrend.isLoading} error={attendanceTrend.error} onRetry={() => attendanceTrend.refetch()}>
          <ResponsiveContainer width="100%" height={280} minWidth={0}>
            <BarChart data={attendanceTrend.data ?? []} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={stroke} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} /><YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
              <ChartTooltip contentStyle={tip} cursor={{ fill: "var(--color-surface-sunken)" }} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="present" name="Present" stackId="a" fill="var(--color-chart-5)" /><Bar dataKey="onLeave" name="Leave" stackId="a" fill="var(--color-chart-4)" /><Bar dataKey="absent" name="Absent" stackId="a" fill="var(--color-danger)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* leave trends */}
        <ChartCard title="Leave Trends" description="Days taken per month by type" isLoading={leaveTrends.isLoading} error={leaveTrends.error} onRetry={() => leaveTrends.refetch()}
          action={<Button variant="ghost" size="icon-sm" aria-label="Export" onClick={() => exportSeriesCsv("leave-trends.csv", leaveTrends.data?.points ?? [])}><Download /></Button>}>
          <ResponsiveContainer width="100%" height={280} minWidth={0}>
            <BarChart data={leaveTrends.data?.points ?? []} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={stroke} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} /><YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
              <ChartTooltip contentStyle={tip} cursor={{ fill: "var(--color-surface-sunken)" }} /><Legend wrapperStyle={{ fontSize: 12 }} />
              {(leaveTrends.data?.types ?? []).map((t, i) => <Bar key={t} dataKey={t} stackId="l" fill={PALETTE[i % PALETTE.length]} />)}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* hiring + payroll */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Hiring Funnel" description="Candidates by current stage" isLoading={hiringFunnel.isLoading} error={hiringFunnel.error} onRetry={() => hiringFunnel.refetch()}>
          {funnelData.every((d) => d.value === 0) ? (
            <div className="flex h-full items-center justify-center text-sm text-text-faint">No candidates in the pipeline yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={280} minWidth={0}>
              <FunnelChart><ChartTooltip contentStyle={tip} />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  <LabelList position="right" fill="var(--color-text)" stroke="none" dataKey="name" fontSize={11} />
                  {funnelData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {canPayroll && (
          <ChartCard title="Payroll Cost Trend" description="Net payout per month" isLoading={payrollTrend.isLoading} error={payrollTrend.error} onRetry={() => payrollTrend.refetch()}
            action={<Button variant="ghost" size="icon-sm" aria-label="Export" onClick={() => exportSeriesCsv("payroll-trend.csv", payrollTrend.data ?? [])}><Download /></Button>}>
            <ResponsiveContainer width="100%" height={280} minWidth={0}>
              <AreaChart data={payrollTrend.data ?? []} margin={{ top: 4, right: 8, left: 6, bottom: 0 }}>
                <defs><linearGradient id="rpay" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke={stroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} /><YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => compactINR(Number(v))} width={56} />
                <ChartTooltip contentStyle={tip} formatter={(v) => compactINR(Number(v))} />
                <Area type="monotone" dataKey="net" name="Net Payout" stroke="var(--color-chart-2)" strokeWidth={2} fill="url(#rpay)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {!canPayroll && (
          <ChartCard title="Hiring Trend" description="Applications, offers and joins" isLoading={hiringTrend.isLoading} error={hiringTrend.error} onRetry={() => hiringTrend.refetch()}>
            <ResponsiveContainer width="100%" height={280} minWidth={0}>
              <BarChart data={hiringTrend.data ?? []} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={stroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} /><YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
                <ChartTooltip contentStyle={tip} cursor={{ fill: "var(--color-surface-sunken)" }} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="applications" name="Applied" fill="var(--color-chart-3)" radius={[3, 3, 0, 0]} /><Bar dataKey="joined" name="Joined" fill="var(--color-chart-5)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* department performance */}
      <Card className="rounded-xl">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Department Performance</CardTitle>
          <Button variant="ghost" size="icon-sm" aria-label="Export" onClick={() => exportSeriesCsv("departments.csv", (departments.data ?? []).map(({ id: _id, ...r }) => r))}><Download /></Button>
        </CardHeader>
        <CardContent>
          {departments.isError ? <ErrorState message={apiErrorMessage(departments.error)} onRetry={() => departments.refetch()} /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {(departments.data ?? []).map((d) => {
                const max = Math.max(...(departments.data ?? []).map((x) => x.headcount), 1);
                return (
                  <div key={d.id} className="rounded-lg border border-border p-3.5">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-text">{d.name}</p>
                      <span className="text-sm font-semibold tabular-nums">{d.headcount}</span>
                    </div>
                    <p className="text-[11px] text-text-muted">{d.head ?? "No head"}{d.newThisMonth > 0 ? ` · +${d.newThisMonth} this month` : ""}</p>
                    <div className="mt-2 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-(--chart-2)" style={{ width: `${(d.headcount / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-text-faint"><CalendarCheck2 className="size-3.5" /> All charts reflect live database records. Empty series mean no data for that range yet.</p>
    </div>
  );
}
