import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft, Banknote, Briefcase, Building2, Cake, CalendarCheck2, CalendarDays,
  CheckCircle2, Circle, Clock, Download, FileText, GraduationCap, Mail, MapPin,
  MonitorSmartphone, PartyPopper, Pencil, Phone, ShieldAlert, UserCog, Wallet,
} from "lucide-react";
import { useEmployee, useEmployeeTimeline, useLifecycleTransition } from "./useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { api, apiErrorMessage } from "@/lib/api";
import { cn, compactINR, formatDate, formatDateTime, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";

const TRANSITIONS: Record<string, string[]> = {
  CANDIDATE: ["ONBOARDING", "TERMINATED"],
  ONBOARDING: ["PROBATION", "ACTIVE", "TERMINATED"],
  PROBATION: ["ACTIVE", "TERMINATED", "RESIGNED"],
  ACTIVE: ["RESIGNED", "TERMINATED"],
  RESIGNED: ["ALUMNI", "ACTIVE"],
  TERMINATED: ["ALUMNI"],
  ALUMNI: ["ONBOARDING"],
};

/* ---------- small building blocks ---------- */
function Field({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: typeof Mail }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon className="size-3.5 mt-0.5 text-text-faint shrink-0" />}
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-text-faint">{label}</p>
        <p className="text-sm font-medium text-text break-words">{value ?? "—"}</p>
      </div>
    </div>
  );
}

function SummaryCard({ title, icon: Icon, children }: { title: string; icon: typeof Briefcase; children: React.ReactNode }) {
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-text-muted flex items-center gap-2">
          <Icon className="size-4 text-primary dark:text-chart-3" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function SnapshotStat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-lg bg-surface-sunken px-3 py-2.5 text-center">
      <p className={cn("text-lg font-semibold tabular-nums", accent ?? "text-text")}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-text-muted leading-tight">{label}</p>
    </div>
  );
}

/* ---------- celebration helpers ---------- */
function celebration(dateStr: string | null, type: "birthday" | "anniversary"): { label: string; today: boolean; years?: number } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date();
  const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < new Date(today.toDateString())) next.setFullYear(next.getFullYear() + 1);
  const days = Math.round((next.getTime() - new Date(today.toDateString()).getTime()) / 86400000);
  if (days > 14) return null;
  const years = next.getFullYear() - d.getFullYear();
  if (type === "anniversary" && years < 1) return null;
  return { label: days === 0 ? "Today" : formatDate(next), today: days === 0, years };
}

/* ============================================================= */
export function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const employee = useEmployee(id);
  const timeline = useEmployeeTimeline(id);
  const transition = useLifecycleTransition(id ?? "");
  const [lifecycleOpen, setLifecycleOpen] = React.useState(false);
  const [nextStatus, setNextStatus] = React.useState("");
  const [remarks, setRemarks] = React.useState("");

  // attendance snapshot (current month) — gated on permission
  const now = new Date();
  const attendance = useQuery({
    queryKey: ["attendance", "employee", id, now.getMonth() + 1],
    queryFn: async () => (await api.get<{ data: { summary: Record<string, number> } }>(`/attendance/employee/${id}`, { params: { month: now.getMonth() + 1, year: now.getFullYear() } })).data.data,
    enabled: Boolean(id) && can("attendance:read_all"),
  });

  // payroll snapshot — gated
  const payroll = useQuery({
    queryKey: ["payroll", "employee-salary", id],
    queryFn: async () => {
      const list = (await api.get<{ data: Array<Record<string, any>> }>("/payroll/employees")).data.data;
      return list.find((e) => e["id"] === id) ?? null;
    },
    enabled: Boolean(id) && can("payroll:read_all"),
  });

  if (employee.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      </div>
    );
  }
  if (employee.isError || !employee.data) {
    return <ErrorState message={apiErrorMessage(employee.error)} onRetry={() => employee.refetch()} />;
  }

  const e = employee.data;
  const allowedTransitions = TRANSITIONS[e["status"] as string] ?? [];
  const bday = celebration(e["dateOfBirth"], "birthday");
  const anniv = celebration(e["dateOfJoining"], "anniversary");

  // profile completion (client-side, from available data)
  const checks: Array<{ key: string; done: boolean }> = [
    { key: "Photo", done: Boolean(e["photoUrl"]) },
    { key: "Phone", done: Boolean(e["phone"]) },
    { key: "Date of birth", done: Boolean(e["dateOfBirth"]) },
    { key: "Address", done: Boolean(e["currentAddress"]) },
    { key: "Documents", done: (e["documents"]?.length ?? 0) > 0 },
    { key: "Emergency contact", done: (e["emergencyContacts"]?.length ?? 0) > 0 },
    { key: "Bank details", done: (e["bankDetails"]?.length ?? 0) > 0 },
    { key: "Skills", done: (e["skills"]?.length ?? 0) >= 3 },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  const completion = Math.round((doneCount / checks.length) * 100);
  const missing = checks.filter((c) => !c.done).map((c) => c.key);

  const att = attendance.data?.summary;

  return (
    <div className="space-y-4">
      {/* ============ EMPLOYEE HEADER CARD ============ */}
      <Card className="rounded-xl">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="Back" className="mt-1">
              <ArrowLeft />
            </Button>
            <Avatar size="xl" className="ring-2 ring-border shrink-0">
              {e["photoUrl"] && <AvatarImage src={e["photoUrl"]} alt="" />}
              <AvatarFallback className="text-xl">{initials(e["firstName"], e["lastName"])}</AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-48">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-text">{e["firstName"]} {e["lastName"]}</h1>
                <Badge variant={statusVariant(e["status"])}>{e["status"]}</Badge>
                {bday && <Badge variant="warning"><Cake className="size-3" /> {bday.today ? "Birthday today" : `Birthday ${bday.label}`}</Badge>}
                {anniv && <Badge variant="success"><PartyPopper className="size-3" /> {anniv.years}y {anniv.today ? "today" : anniv.label}</Badge>}
              </div>
              <p className="text-sm text-text-muted mt-0.5">{e["designation"]?.title ?? "—"} · {e["department"]?.name ?? "—"}</p>
              {/* identity chips — everything visible immediately */}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Badge className="font-mono">{e["employeeCode"]}</Badge>
                <Badge>{(e["employmentType"] as string)?.replace("_", " ")}</Badge>
                <Badge><Mail className="size-3" /> {e["email"]}</Badge>
                {e["phone"] && <Badge><Phone className="size-3" /> {e["phone"]}</Badge>}
                {e["location"] && <Badge><MapPin className="size-3" /> {e["location"].name}</Badge>}
                {e["dateOfJoining"] && <Badge variant="primary"><CalendarDays className="size-3" /> Joined {formatDate(e["dateOfJoining"])}</Badge>}
                {e["manager"] && <Badge variant="info">Reports to {e["manager"].firstName} {e["manager"].lastName}</Badge>}
              </div>
            </div>
          </div>

          {/* quick actions */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3.5">
            {can("employees:update", "employees:manage") && (
              <Button size="sm" asChild><Link to={`/employees/${id}/edit`}><Pencil /> Edit Profile</Link></Button>
            )}
            {can("attendance:read_all") && <Button variant="secondary" size="sm" asChild><Link to="/attendance"><CalendarCheck2 /> Attendance</Link></Button>}
            {can("payroll:read_all") && <Button variant="secondary" size="sm" asChild><Link to="/payroll"><Wallet /> Payroll</Link></Button>}
            {can("assets:assign", "assets:manage") && <Button variant="secondary" size="sm" asChild><Link to="/assets"><MonitorSmartphone /> Assign Asset</Link></Button>}
            {can("employees:manage") && allowedTransitions.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setLifecycleOpen(true)}><UserCog /> Lifecycle</Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => window.print()}><Download /> Summary</Button>
          </div>
        </CardContent>
      </Card>

      {/* ============ SUMMARY CARDS ============ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard title="Employment" icon={Briefcase}>
          <Field label="Employee ID" value={e["employeeCode"]} />
          <Field label="Department" value={e["department"]?.name} />
          <Field label="Designation" value={e["designation"]?.title} />
          <Field label="Joining Date" value={formatDate(e["dateOfJoining"])} />
        </SummaryCard>
        <SummaryCard title="Personal" icon={Cake}>
          <Field label="Date of Birth" value={formatDate(e["dateOfBirth"])} />
          <Field label="Gender" value={e["gender"]} />
          <Field label="Blood Group" value={e["bloodGroup"]} />
          <Field label="Marital Status" value={e["maritalStatus"]} />
        </SummaryCard>
        <SummaryCard title="Contact" icon={Mail}>
          <Field label="Work Email" value={e["email"]} />
          <Field label="Phone" value={e["phone"]} />
          <Field label="Personal Email" value={e["personalEmail"]} />
          <Field label="Emergency Contact" value={e["emergencyContacts"]?.[0] ? `${e["emergencyContacts"][0].name} (${e["emergencyContacts"][0].phone})` : null} />
        </SummaryCard>
        <SummaryCard title="Organization" icon={Building2}>
          <Field label="Manager" value={e["manager"] ? (
            <Link to={`/employees/${e["manager"].id}`} className="text-primary hover:underline dark:text-chart-3">{e["manager"].firstName} {e["manager"].lastName}</Link>
          ) : null} />
          <Field label="Direct Reports" value={e["reports"]?.length ?? 0} />
          <Field label="Location" value={e["location"]?.name} />
          <Field label="Work Email" value={e["email"]} />
        </SummaryCard>
      </div>

      {/* ============ COMPLETION + SNAPSHOTS ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* completion */}
        <Card className="rounded-xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Profile Completion</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="relative size-16 shrink-0">
                <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
                  <circle cx="32" cy="32" r="27" fill="none" stroke="var(--color-border)" strokeWidth="6" />
                  <circle cx="32" cy="32" r="27" fill="none" strokeWidth="6" strokeLinecap="round"
                    stroke={completion >= 80 ? "var(--color-success)" : completion >= 50 ? "var(--color-warning)" : "var(--color-danger)"}
                    strokeDasharray={2 * Math.PI * 27} strokeDashoffset={2 * Math.PI * 27 * (1 - completion / 100)} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">{completion}%</span>
              </div>
              <div className="text-sm">
                <p className="font-medium text-text">{doneCount}/{checks.length} complete</p>
                {missing.length > 0 ? (
                  <p className="text-xs text-text-muted">Missing: {missing.slice(0, 3).join(", ")}{missing.length > 3 ? "…" : ""}</p>
                ) : <p className="text-xs text-success">All set 🎉</p>}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
              {checks.map((c) => (
                <span key={c.key} className={cn("flex items-center gap-1.5 text-xs", c.done ? "text-text-muted" : "text-text")}>
                  {c.done ? <CheckCircle2 className="size-3.5 text-success" /> : <Circle className="size-3.5 text-text-faint" />}
                  {c.key}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* attendance snapshot */}
        {can("attendance:read_all") && (
          <Card className="rounded-xl">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarCheck2 className="size-4 text-primary dark:text-chart-3" /> Attendance ({now.toLocaleString("en", { month: "short" })})</CardTitle></CardHeader>
            <CardContent>
              {attendance.isLoading ? <Skeleton className="h-16 w-full" /> : (
                <div className="grid grid-cols-4 gap-2">
                  <SnapshotStat label="Present" value={att?.["present"] ?? 0} accent="text-success" />
                  <SnapshotStat label="Absent" value={att?.["absent"] ?? 0} accent="text-danger" />
                  <SnapshotStat label="Leaves" value={att?.["onLeave"] ?? 0} accent="text-(--chart-6)" />
                  <SnapshotStat label="Late" value={att?.["late"] ?? 0} accent="text-warning" />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* payroll snapshot */}
        {can("payroll:read_all") && (
          <Card className="rounded-xl">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Banknote className="size-4 text-primary dark:text-chart-3" /> Payroll</CardTitle></CardHeader>
            <CardContent>
              {payroll.isLoading ? <Skeleton className="h-16 w-full" /> : payroll.data?.["salaries"]?.[0] ? (
                <div className="grid grid-cols-2 gap-2">
                  <SnapshotStat label="Annual CTC" value={compactINR(Number(payroll.data["salaries"][0].annualCtc))} />
                  <SnapshotStat label="Monthly Gross" value={compactINR(Number(payroll.data["salaries"][0].monthlyGross))} />
                </div>
              ) : <p className="text-sm text-text-faint">No salary assigned yet.</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ============ DOCUMENT CENTER ============ */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="size-4 text-primary dark:text-chart-3" /> Document Center</CardTitle></CardHeader>
        <CardContent>
          {!e["documents"]?.length ? (
            <EmptyState icon={FileText} title="No documents uploaded" description="Identity, contracts and certificates appear here." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {e["documents"].map((d: Record<string, any>) => (
                <div key={d["id"]} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary dark:text-chart-3"><FileText className="size-4" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">{d["name"]}</p>
                      <p className="text-[11px] text-text-muted">{d["category"]} · {formatDate(d["createdAt"])}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={d["verifiedAt"] ? "success" : "default"} className="text-[9px]">{d["verifiedAt"] ? "Verified" : "Pending"}</Badge>
                    <Button variant="ghost" size="icon-sm" asChild aria-label="Download"><a href={d["fileUrl"]} target="_blank" rel="noreferrer"><Download className="size-3.5" /></a></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ QUALIFICATIONS + BANK/CONTACTS ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><GraduationCap className="size-4 text-primary dark:text-chart-3" /> Qualifications</CardTitle></CardHeader>
          <CardContent>
            {!e["educations"]?.length && !e["certifications"]?.length && !e["experiences"]?.length ? (
              <EmptyState icon={GraduationCap} title="No qualifications recorded" />
            ) : (
              <ol className="relative ml-2 border-l border-border space-y-3">
                {e["educations"]?.map((ed: Record<string, any>) => (
                  <li key={ed["id"]} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary ring-4 ring-surface" />
                    <p className="text-sm font-medium text-text">{ed["degree"]}{ed["field"] ? ` · ${ed["field"]}` : ""}</p>
                    <p className="text-xs text-text-muted">{ed["institution"]} {ed["startYear"] ? `· ${ed["startYear"]}–${ed["endYear"] ?? ""}` : ""}</p>
                  </li>
                ))}
                {e["certifications"]?.map((c: Record<string, any>) => (
                  <li key={c["id"]} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-(--chart-4) ring-4 ring-surface" />
                    <p className="text-sm font-medium text-text">{c["name"]}</p>
                    <p className="text-xs text-text-muted">{c["issuer"] ?? ""} {c["issuedOn"] ? `· ${formatDate(c["issuedOn"])}` : ""}</p>
                  </li>
                ))}
                {e["experiences"]?.map((ex: Record<string, any>) => (
                  <li key={ex["id"]} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-(--chart-2) ring-4 ring-surface" />
                    <p className="text-sm font-medium text-text">{ex["title"]} — {ex["companyName"]}</p>
                    <p className="text-xs text-text-muted">{formatDate(ex["startDate"])} → {ex["endDate"] ? formatDate(ex["endDate"]) : "Present"}</p>
                  </li>
                ))}
              </ol>
            )}
            {e["skills"]?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {e["skills"].map((s: { skill: { id: string; name: string }; level: number }) => (
                  <Badge key={s.skill.id} variant="primary">{s.skill.name} · L{s.level}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Banknote className="size-4 text-primary dark:text-chart-3" /> Bank & Emergency Contacts</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {e["bankDetails"]?.map((b: Record<string, any>) => (
              <div key={b["id"]} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-text flex items-center gap-1.5">{b["bankName"]} {b["isPrimary"] && <Badge variant="primary" className="text-[9px]">Primary</Badge>}</p>
                <p className="text-xs text-text-muted font-mono">{b["accountNumber"]} {b["ifsc"] ? `· ${b["ifsc"]}` : ""}</p>
              </div>
            ))}
            {e["emergencyContacts"]?.map((c: Record<string, any>) => (
              <div key={c["id"]} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-text flex items-center gap-1.5"><ShieldAlert className="size-3.5 text-warning" /> {c["name"]} <span className="text-text-muted font-normal">({c["relation"]})</span></p>
                <p className="text-xs text-text-muted">{c["phone"]}</p>
              </div>
            ))}
            {!e["bankDetails"]?.length && !e["emergencyContacts"]?.length && (
              <EmptyState icon={Banknote} title="No bank or emergency details" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ TIMELINE ============ */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="size-4 text-primary dark:text-chart-3" /> Activity Timeline</CardTitle></CardHeader>
        <CardContent>
          {timeline.isLoading ? <Skeleton className="h-32 w-full" /> : !timeline.data?.length ? (
            <EmptyState icon={Clock} title="No events yet" />
          ) : (
            <ol className="relative ml-3 border-l border-border">
              {timeline.data.map((ev, i) => (
                <motion.li key={ev["id"]} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} className="ml-5 pb-4 last:pb-0">
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary ring-4 ring-surface" />
                  <p className="text-sm font-medium text-text">{(ev["type"] as string).replace(/_/g, " ")}</p>
                  <p className="text-xs text-text-muted">{formatDateTime(ev["effectiveOn"])}{ev["remarks"] ? ` — ${ev["remarks"]}` : ""}</p>
                  {ev["toValue"]?.status && (
                    <Badge variant={statusVariant(ev["toValue"].status)} className="mt-1">
                      {ev["fromValue"]?.status ? `${ev["fromValue"].status} → ` : ""}{ev["toValue"].status}
                    </Badge>
                  )}
                </motion.li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* lifecycle dialog */}
      <Dialog open={lifecycleOpen} onOpenChange={setLifecycleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lifecycle transition</DialogTitle>
            <DialogDescription>Current status: <Badge variant={statusVariant(e["status"])}>{e["status"]}</Badge></DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="New status" required>
              <Select value={nextStatus} onValueChange={setNextStatus}>
                <SelectTrigger aria-label="New status"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>{allowedTransitions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Remarks">
              <Textarea value={remarks} onChange={(ev) => setRemarks(ev.target.value)} rows={2} placeholder="Reason / notes for the audit trail" />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setLifecycleOpen(false)}>Cancel</Button>
            <Button disabled={!nextStatus} loading={transition.isPending} onClick={async () => {
              await transition.mutateAsync({ status: nextStatus, remarks: remarks || undefined });
              setLifecycleOpen(false); setNextStatus(""); setRemarks("");
              void employee.refetch(); void timeline.refetch();
            }}>Apply transition</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
