import * as React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Building2, ChevronRight, Crown, Layers, Mail, Network, Search, Users, UserSquare2,
  CalendarCheck2, Star, ArrowLeft, X,
} from "lucide-react";
import { useDepartmentDetail, useManagerDetail, useOrgOverview } from "./useOrgExplorer";
import { useDepartments, useDesignations, useEmployees, useLocations } from "./useEmployees";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";
type View = { type: "departments" } | { type: "department"; id: string; name: string } | { type: "manager"; id: string; name: string };

/* ───────────── reusable people card ───────────── */
interface CardPerson {
  id: string; firstName: string; lastName: string; photoUrl: string | null; email?: string | null;
  status?: string; designation?: { title: string } | null; department?: { id: string; name: string } | null;
  location?: { name: string } | null; manager?: { firstName: string; lastName: string } | null; directReports?: number;
}
function PersonCard({ p, onViewTeam }: { p: CardPerson; onViewTeam?: (id: string, name: string) => void }) {
  const reports = p.directReports ?? 0;
  return (
    <Card className="rounded-xl p-4 hover:shadow-raised transition-shadow">
      <div className="flex items-start gap-3">
        <Avatar size="lg">{p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}<AvatarFallback>{initials(p.firstName, p.lastName)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link to={`/employees/${p.id}`} className="font-semibold text-text hover:underline truncate">{p.firstName} {p.lastName}</Link>
            {p.status && <Badge variant={statusVariant(p.status)} className="shrink-0">{p.status.toLowerCase()}</Badge>}
          </div>
          <p className="text-xs text-text-muted truncate">{p.designation?.title ?? "—"}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-faint">
            {p.department && <span className="flex items-center gap-1"><Building2 className="size-3" /> {p.department.name}</span>}
            {p.location && <span>· {p.location.name}</span>}
            {p.manager && <span>· reports to {p.manager.firstName} {p.manager.lastName}</span>}
          </div>
          {reports > 0 && <p className="mt-1 text-[11px] font-medium text-primary dark:text-chart-3 flex items-center gap-1"><Users className="size-3" /> {reports} direct report{reports === 1 ? "" : "s"}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <Button asChild size="sm" variant="secondary"><Link to={`/employees/${p.id}`}><UserSquare2 className="size-3.5" /> Profile</Link></Button>
        {reports > 0 && onViewTeam && <Button size="sm" variant="secondary" onClick={() => onViewTeam(p.id, `${p.firstName} ${p.lastName}`)}><Network className="size-3.5" /> Team</Button>}
        {p.email && <Button asChild size="sm" variant="ghost"><a href={`mailto:${p.email}`}><Mail className="size-3.5" /> Message</a></Button>}
      </div>
    </Card>
  );
}

/* ───────────── analytics row ───────────── */
function Analytics() {
  const ov = useOrgOverview();
  const t = ov.data?.totals;
  const cards = [
    { label: "Total Employees", value: t?.employees, icon: Users, accent: "text-primary dark:text-chart-3" },
    { label: "Departments", value: t?.departments, icon: Building2, accent: "text-info" },
    { label: "Managers", value: t?.managers, icon: Crown, accent: "text-warning" },
    { label: "Individual Contributors", value: t?.individualContributors, icon: UserSquare2, accent: "text-text" },
    { label: "New Joiners (30d)", value: t?.newJoiners, icon: CalendarCheck2, accent: "text-success" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="rounded-xl p-4 flex items-center gap-3">
          <div className={cn("rounded-lg bg-surface-sunken p-2.5", c.accent)}><c.icon className="size-5" /></div>
          <div><p className={cn("text-xl font-semibold tabular-nums", c.accent)}>{ov.isLoading ? <Skeleton className="h-7 w-8" /> : c.value ?? 0}</p><p className="text-[10px] uppercase tracking-wide text-text-muted leading-tight">{c.label}</p></div>
        </Card>
      ))}
    </div>
  );
}

/* ───────────── department grid ───────────── */
const DEPT_TINT = ["bg-primary/10 text-primary dark:text-chart-3", "bg-info/10 text-info", "bg-success/10 text-success", "bg-warning/10 text-warning", "bg-danger/10 text-danger"];
function DepartmentGrid({ onOpen }: { onOpen: (id: string, name: string) => void }) {
  const ov = useOrgOverview();
  if (ov.isLoading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>;
  if (!ov.data?.departments.length) return <EmptyState icon={Building2} title="No departments" description="Set up departments and assign employees to see the org structure." />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ov.data.departments.map((d, i) => (
        <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}>
          {/* every card has the SAME structure + height — icon, name, equal footer row */}
          <Card className="flex h-full flex-col rounded-xl p-5 hover:shadow-raised transition-shadow cursor-pointer group" onClick={() => onOpen(d.id, d.name)}>
            <div className="flex items-start justify-between">
              <div className={cn("rounded-xl p-3", DEPT_TINT[i % DEPT_TINT.length])}><Building2 className="size-6" /></div>
              <ChevronRight className="size-5 text-text-faint group-hover:translate-x-0.5 transition-transform" />
            </div>
            <h3 className="mt-3 text-lg font-semibold text-text">{d.name}</h3>
            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
              <div><p className="text-lg font-semibold text-text tabular-nums">{d.headcount}</p><p className="text-[11px] uppercase tracking-wide text-text-muted">Employee{d.headcount === 1 ? "" : "s"}</p></div>
              <div><p className="text-lg font-semibold text-text tabular-nums">{d.managerCount}</p><p className="text-[11px] uppercase tracking-wide text-text-muted">Manager{d.managerCount === 1 ? "" : "s"}</p></div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

/* ───────────── department detail ───────────── */
function DepartmentView({ id, onManager }: { id: string; onManager: (id: string, name: string) => void }) {
  const detail = useDepartmentDetail(id);
  if (detail.isLoading || !detail.data) return <Skeleton className="h-96 rounded-xl" />;
  const d = detail.data;
  const maxBd = Math.max(1, ...d.designationBreakdown.map((b) => b.count));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-xl p-4 lg:col-span-2">
          <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><Layers className="size-4 text-primary dark:text-chart-3" /> Composition</p>
          <div className="space-y-2">
            {d.designationBreakdown.map((b) => (
              <div key={b.title} className="flex items-center gap-2 text-xs"><span className="w-40 truncate text-text-muted">{b.title}</span><div className="flex-1 h-2 rounded-full bg-surface-sunken overflow-hidden"><div className="h-full bg-primary dark:bg-chart-3" style={{ width: `${(b.count / maxBd) * 100}%` }} /></div><span className="w-6 text-right tabular-nums text-text-muted">{b.count}</span></div>
            ))}
          </div>
        </Card>
        <Card className="rounded-xl p-4">
          <p className="text-sm font-semibold text-text mb-2 flex items-center gap-2"><Crown className="size-4 text-warning" /> Department Head</p>
          {d.head ? <PersonCard p={d.head} onViewTeam={onManager} /> : <p className="text-sm text-text-faint">No head assigned.</p>}
        </Card>
      </div>

      {d.managers.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-text mb-2 flex items-center gap-2"><Users className="size-4 text-primary dark:text-chart-3" /> Teams ({d.managers.length})</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{d.managers.map((m) => <PersonCard key={m.id} p={m} onViewTeam={onManager} />)}</div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold text-text mb-2 flex items-center gap-2"><UserSquare2 className="size-4 text-text-muted" /> All members ({d.headcount})</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{d.members.map((m) => <PersonCard key={m.id} p={m} onViewTeam={onManager} />)}</div>
      </section>
    </div>
  );
}

/* ───────────── manager detail ───────────── */
function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return <div className="rounded-lg bg-surface-sunken p-3 text-center"><p className={cn("text-xl font-semibold tabular-nums", accent ?? "text-text")}>{value}</p><p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p></div>;
}
function ManagerView({ id, onManager }: { id: string; onManager: (id: string, name: string) => void }) {
  const detail = useManagerDetail(id);
  if (detail.isLoading || !detail.data) return <Skeleton className="h-96 rounded-xl" />;
  const m = detail.data;
  const att = m.attendance;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-xl p-4 lg:col-span-1">
          <div className="flex items-center gap-3">
            <Avatar size="lg">{m.manager.photoUrl && <AvatarImage src={m.manager.photoUrl} alt="" />}<AvatarFallback className="text-lg">{initials(m.manager.firstName, m.manager.lastName)}</AvatarFallback></Avatar>
            <div className="min-w-0">
              <Link to={`/employees/${m.manager.id}`} className="font-semibold text-text hover:underline block truncate">{m.manager.firstName} {m.manager.lastName}</Link>
              <p className="text-xs text-text-muted">{m.manager.designation?.title ?? "—"}</p>
              <p className="text-[11px] text-text-faint">{m.manager.department?.name}{m.manager.location ? ` · ${m.manager.location.name}` : ""}</p>
            </div>
          </div>
          {m.manager.manager && <p className="mt-3 text-xs text-text-muted border-t border-border pt-3">Reports to <Link to={`/employees/${m.manager.manager.id}`} className="text-primary dark:text-chart-3 hover:underline">{m.manager.manager.firstName} {m.manager.manager.lastName}</Link></p>}
        </Card>
        <Card className="rounded-xl p-4 lg:col-span-2">
          <p className="text-sm font-semibold text-text mb-3">Team statistics</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Direct reports" value={m.directReports.length} accent="text-primary dark:text-chart-3" />
            <Stat label="Total team" value={m.teamSize} accent="text-info" />
            <Stat label="Present today" value={`${att.present}/${att.total}`} accent="text-success" />
            <Stat label="Avg rating" value={m.performance.avgRating ?? "—"} accent="text-warning" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-text-muted">
            <span className="flex items-center gap-1"><CalendarCheck2 className="size-3 text-success" /> {att.present} present</span>
            <span>· {att.onLeave} on leave</span>
            <span>· {att.notMarked} not marked</span>
            {m.performance.reviewed > 0 && <span className="flex items-center gap-1">· <Star className="size-3 text-warning" /> {m.performance.reviewed}/{m.performance.total} reviewed</span>}
          </div>
        </Card>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-text mb-2 flex items-center gap-2"><Users className="size-4 text-primary dark:text-chart-3" /> Direct reports ({m.directReports.length})</h3>
        {m.directReports.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{m.directReports.map((r) => <PersonCard key={r.id} p={r} onViewTeam={onManager} />)}</div>
        ) : <p className="text-sm text-text-faint">No direct reports.</p>}
      </section>
    </div>
  );
}

/* ───────────── search / filtered people ───────────── */
function PeopleResults({ filters, onManager }: { filters: Record<string, string | undefined>; onManager: (id: string, name: string) => void }) {
  const employees = useEmployees({ page: 1, limit: 60, ...filters });
  const rows = employees.data?.data ?? [];
  if (employees.isLoading) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>;
  if (!rows.length) return <EmptyState icon={Search} title="No people found" description="Try a different search or clear the filters." />;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map((e) => <PersonCard key={e.id} p={e as CardPerson} onViewTeam={onManager} />)}</div>;
}

/* ───────────── page ───────────── */
export function OrgChartPage() {
  const [view, setView] = React.useState<View>({ type: "departments" });
  const [search, setSearch] = React.useState("");
  const [dept, setDept] = React.useState(ALL);
  const [loc, setLoc] = React.useState(ALL);
  const [desig, setDesig] = React.useState(ALL);
  const [empType, setEmpType] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);

  const departments = useDepartments();
  const locations = useLocations();
  const designations = useDesignations();

  const filtersActive = Boolean(search.trim()) || [dept, loc, desig, empType, status].some((f) => f !== ALL);
  const openDept = (id: string, name: string) => setView({ type: "department", id, name });
  const openManager = (id: string, name: string) => setView({ type: "manager", id, name });
  const clearFilters = () => { setSearch(""); setDept(ALL); setLoc(ALL); setDesig(ALL); setEmpType(ALL); setStatus(ALL); };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text flex items-center gap-2"><Network className="size-5 text-primary dark:text-chart-3" /> Org Chart</h1>
        <p className="text-sm text-text-muted">Explore departments, teams, managers and reporting structures.</p>
      </div>

      <Analytics />

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-faint" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…" className="pl-8" aria-label="Search people" />
        </div>
        <Select value={dept} onValueChange={setDept}><SelectTrigger className="w-40 h-9" aria-label="Department"><SelectValue placeholder="Department" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All departments</SelectItem>{(departments.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
        <Select value={loc} onValueChange={setLoc}><SelectTrigger className="w-36 h-9" aria-label="Location"><SelectValue placeholder="Location" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All locations</SelectItem>{(locations.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>
        <Select value={desig} onValueChange={setDesig}><SelectTrigger className="w-40 h-9" aria-label="Designation"><SelectValue placeholder="Designation" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All designations</SelectItem>{(designations.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent></Select>
        <Select value={empType} onValueChange={setEmpType}><SelectTrigger className="w-36 h-9" aria-label="Type"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All types</SelectItem>{["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"].map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ").toLowerCase()}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-32 h-9" aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All statuses</SelectItem>{["ACTIVE", "PROBATION", "ONBOARDING", "RESIGNED"].map((s) => <SelectItem key={s} value={s}>{s.toLowerCase()}</SelectItem>)}</SelectContent></Select>
        {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="size-3.5" /> Clear</Button>}
      </div>

      {/* breadcrumb */}
      {!filtersActive && view.type !== "departments" && (
        <div className="flex items-center gap-1.5 text-sm">
          <Button variant="ghost" size="sm" onClick={() => setView({ type: "departments" })}><ArrowLeft className="size-4" /> Departments</Button>
          <ChevronRight className="size-3.5 text-text-faint" />
          <span className="font-medium text-text">{view.name}</span>
          {view.type === "manager" && <Badge variant="default" className="ml-1">team</Badge>}
        </div>
      )}

      {/* content */}
      {filtersActive ? (
        <PeopleResults
          filters={{
            search: search.trim() || undefined,
            departmentId: dept === ALL ? undefined : dept,
            locationId: loc === ALL ? undefined : loc,
            designationId: desig === ALL ? undefined : desig,
            employmentType: empType === ALL ? undefined : empType,
            status: status === ALL ? undefined : status,
          }}
          onManager={openManager}
        />
      ) : view.type === "manager" ? (
        <ManagerView id={view.id} onManager={openManager} />
      ) : view.type === "department" ? (
        <DepartmentView id={view.id} onManager={openManager} />
      ) : (
        <DepartmentGrid onOpen={openDept} />
      )}
    </div>
  );
}
