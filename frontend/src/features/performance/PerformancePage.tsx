import * as React from "react";
import {
  Award, BarChart3, CalendarRange, CheckCircle2, ClipboardList, Gauge, Plus,
  Star, Target, Trash2, TrendingUp, Trophy, Users,
} from "lucide-react";
import {
  GOAL_STATUSES, useAcknowledgeReview, useAddKeyResult, useAddKpi, useCreateCycle,
  useCreateGoal, useCreateObjective, useCycles, useDeleteGoal, useDeleteObjective,
  useGoals, useMyReviews, useObjectives, usePerfDashboard, usePromotions, useSaveReview,
  useSaveSelf, useSelfAssessment, useTeamReviews, useTopPerformers, useUpdateCycle,
  useUpdateGoal, useUpdateKeyResult, useUpdateKpi, type Cycle, type Goal, type Objective,
  type TeamReviewRow,
} from "./usePerformance";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} className={cn(onChange && "cursor-pointer")} aria-label={`${n} star`}>
          <Star className={cn("size-5", n <= value ? "fill-warning text-warning" : "text-text-faint")} />
        </button>
      ))}
    </div>
  );
}

function Bar({ pct, className }: { pct: number; className?: string }) {
  return <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden"><div className={cn("h-full bg-primary dark:bg-chart-3", className)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>;
}

function PersonChip({ p }: { p: { firstName: string; lastName: string; photoUrl: string | null; designation?: { title: string } | null } }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <Avatar size="sm">{p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}<AvatarFallback>{initials(p.firstName, p.lastName)}</AvatarFallback></Avatar>
      <span className="min-w-0"><span className="block text-sm font-medium text-text truncate">{p.firstName} {p.lastName}</span>{p.designation && <span className="block text-[11px] text-text-faint truncate">{p.designation.title}</span>}</span>
    </span>
  );
}

/* ───────────── My Goals ───────────── */
function GoalCard({ goal }: { goal: Goal }) {
  const update = useUpdateGoal();
  const del = useDeleteGoal();
  const addKpi = useAddKpi();
  const updateKpi = useUpdateKpi();
  const pct = goal.targetValue ? Math.round((goal.currentValue / goal.targetValue) * 100) : goal.status === "COMPLETED" ? 100 : 0;
  const [kpiOpen, setKpiOpen] = React.useState(false);
  const [kpi, setKpi] = React.useState({ name: "", unit: "", targetValue: 0 });
  return (
    <Card className="rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-semibold text-text">{goal.title}</p>{goal.description && <p className="text-xs text-text-muted">{goal.description}</p>}</div>
        <Badge variant={statusVariant(goal.status)}>{goal.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-text-faint">
        {goal.weight > 0 && <span>weight {goal.weight}%</span>}
        {goal.dueDate && <span>· due {formatDate(goal.dueDate)}</span>}
      </div>
      {goal.targetValue != null && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-text-muted mb-1"><span>{goal.metric ?? "Progress"}</span><span>{goal.currentValue}/{goal.targetValue} · {pct}%</span></div>
          <Bar pct={pct} className={goal.status === "AT_RISK" ? "bg-danger" : ""} />
        </div>
      )}
      {goal.kpis.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {goal.kpis.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-text-muted truncate">{k.name}</span>
              <span className="flex items-center gap-1.5">
                <Input type="number" value={k.actualValue} onChange={(e) => updateKpi.mutate({ id: k.id, actualValue: Number(e.target.value) })} className="h-7 w-20 text-xs" aria-label={`${k.name} actual`} />
                <span className="text-text-faint">/ {k.targetValue}{k.unit ?? ""}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Select value={goal.status} onValueChange={(v) => update.mutate({ id: goal.id, status: v })}>
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>{GOAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</SelectItem>)}</SelectContent>
        </Select>
        {goal.targetValue != null && <Input type="number" defaultValue={goal.currentValue} onBlur={(e) => Number(e.target.value) !== goal.currentValue && update.mutate({ id: goal.id, currentValue: Number(e.target.value) })} className="h-8 w-24 text-xs" aria-label="Current value" placeholder="current" />}
        <Button size="sm" variant="secondary" onClick={() => setKpiOpen(true)}><Plus className="size-3.5" /> KPI</Button>
        <button onClick={() => del.mutate(goal.id)} className="ml-auto text-text-faint hover:text-danger cursor-pointer" aria-label="Delete goal"><Trash2 className="size-4" /></button>
      </div>
      <Dialog open={kpiOpen} onOpenChange={setKpiOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add KPI to "{goal.title}"</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Name" required className="col-span-3"><Input value={kpi.name} onChange={(e) => setKpi({ ...kpi, name: e.target.value })} /></FormField>
            <FormField label="Target" required><Input type="number" value={kpi.targetValue || ""} onChange={(e) => setKpi({ ...kpi, targetValue: Number(e.target.value) })} /></FormField>
            <FormField label="Unit"><Input value={kpi.unit} onChange={(e) => setKpi({ ...kpi, unit: e.target.value })} placeholder="%, count" /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setKpiOpen(false)}>Cancel</Button>
            <Button disabled={!kpi.name || !kpi.targetValue} loading={addKpi.isPending} onClick={async () => { await addKpi.mutateAsync({ goalId: goal.id, name: kpi.name, unit: kpi.unit || undefined, targetValue: kpi.targetValue }); setKpiOpen(false); setKpi({ name: "", unit: "", targetValue: 0 }); }}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MyGoalsTab({ cycleId }: { cycleId: string }) {
  const goals = useGoals(cycleId);
  const create = useCreateGoal();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", description: "", weight: 0, metric: "", targetValue: "", dueDate: "" });
  const reset = () => setForm({ title: "", description: "", weight: 0, metric: "", targetValue: "", dueDate: "" });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus /> Add Goal</Button></div>
      {goals.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
      ) : !goals.data?.length ? (
        <EmptyState icon={Target} title="No goals yet" description="Set measurable goals for this cycle to track your performance." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">{goals.data.map((g) => <GoalCard key={g.id} goal={g} />)}</div>
      )}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add goal</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Title" required className="col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
            <FormField label="Description" className="col-span-2"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
            <FormField label="Weight (%)"><Input type="number" value={form.weight || ""} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} /></FormField>
            <FormField label="Metric"><Input value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} placeholder="e.g. tickets closed" /></FormField>
            <FormField label="Target value"><Input type="number" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} /></FormField>
            <FormField label="Due date"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button disabled={form.title.length < 3} loading={create.isPending} onClick={async () => { await create.mutateAsync({ cycleId, title: form.title, description: form.description || undefined, weight: form.weight, metric: form.metric || undefined, targetValue: form.targetValue ? Number(form.targetValue) : undefined, dueDate: form.dueDate || undefined }); setOpen(false); reset(); }}>Add goal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────── My OKRs ───────────── */
function ObjectiveCard({ obj }: { obj: Objective }) {
  const del = useDeleteObjective();
  const addKr = useAddKeyResult();
  const updateKr = useUpdateKeyResult();
  const [open, setOpen] = React.useState(false);
  const [kr, setKr] = React.useState({ title: "", metric: "", startValue: 0, targetValue: 0, currentValue: 0 });
  return (
    <Card className="rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-text">{obj.title}</p>
        <button onClick={() => del.mutate(obj.id)} className="text-text-faint hover:text-danger cursor-pointer" aria-label="Delete"><Trash2 className="size-4" /></button>
      </div>
      <div className="mt-2"><div className="flex justify-between text-[11px] text-text-muted mb-1"><span>Progress</span><span>{obj.progress}%</span></div><Bar pct={obj.progress} /></div>
      <div className="mt-3 space-y-2">
        {obj.keyResults.map((k) => {
          const pct = k.targetValue - k.startValue === 0 ? 0 : Math.round(((k.currentValue - k.startValue) / (k.targetValue - k.startValue)) * 100);
          return (
            <div key={k.id} className="rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between gap-2 text-xs"><span className="text-text truncate">{k.title}</span><span className="text-text-faint shrink-0">{pct}%</span></div>
              <div className="mt-1.5 flex items-center gap-2">
                <Bar pct={pct} />
                <Input type="number" defaultValue={k.currentValue} onBlur={(e) => Number(e.target.value) !== k.currentValue && updateKr.mutate({ id: k.id, currentValue: Number(e.target.value) })} className="h-7 w-20 text-xs shrink-0" aria-label="Current" />
              </div>
            </div>
          );
        })}
      </div>
      <Button size="sm" variant="secondary" className="mt-3" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Key Result</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add key result</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Title" required className="col-span-3"><Input value={kr.title} onChange={(e) => setKr({ ...kr, title: e.target.value })} /></FormField>
            <FormField label="Start"><Input type="number" value={kr.startValue || ""} onChange={(e) => setKr({ ...kr, startValue: Number(e.target.value) })} /></FormField>
            <FormField label="Target" required><Input type="number" value={kr.targetValue || ""} onChange={(e) => setKr({ ...kr, targetValue: Number(e.target.value) })} /></FormField>
            <FormField label="Current"><Input type="number" value={kr.currentValue || ""} onChange={(e) => setKr({ ...kr, currentValue: Number(e.target.value) })} /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!kr.title || !kr.targetValue} loading={addKr.isPending} onClick={async () => { await addKr.mutateAsync({ objectiveId: obj.id, ...kr, metric: kr.metric || undefined }); setOpen(false); setKr({ title: "", metric: "", startValue: 0, targetValue: 0, currentValue: 0 }); }}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MyOkrsTab({ cycleId }: { cycleId: string }) {
  const objectives = useObjectives(cycleId);
  const create = useCreateObjective();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", description: "" });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus /> Add Objective</Button></div>
      {objectives.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
      ) : !objectives.data?.length ? (
        <EmptyState icon={TrendingUp} title="No objectives yet" description="Define objectives and measurable key results (OKRs) for this cycle." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">{objectives.data.map((o) => <ObjectiveCard key={o.id} obj={o} />)}</div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add objective</DialogTitle></DialogHeader>
          <FormField label="Objective" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
          <FormField label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={form.title.length < 3} loading={create.isPending} onClick={async () => { await create.mutateAsync({ cycleId, title: form.title, description: form.description || undefined }); setOpen(false); setForm({ title: "", description: "" }); }}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────── Self review ───────────── */
function SelfReviewTab({ cycleId }: { cycleId: string }) {
  const self = useSelfAssessment(cycleId);
  const save = useSaveSelf();
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  React.useEffect(() => { if (self.data) { setRating(self.data.rating ?? 0); setComment(self.data.overallComment ?? ""); } }, [self.data]);
  const submitted = self.data?.status === "SUBMITTED";
  if (self.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  return (
    <Card className="rounded-xl p-5 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text flex items-center gap-2"><ClipboardList className="size-4 text-primary dark:text-chart-3" /> Self Assessment</h3>
        {submitted ? <Badge variant="success"><CheckCircle2 className="size-3" /> Submitted</Badge> : <Badge variant="warning">Draft</Badge>}
      </div>
      <FormField label="Overall self-rating"><Stars value={rating} onChange={submitted ? undefined : setRating} /></FormField>
      <FormField label="Summary of your contributions & growth"><Textarea rows={6} value={comment} disabled={submitted} onChange={(e) => setComment(e.target.value)} placeholder="Highlight your key achievements, impact, and areas you want to grow…" /></FormField>
      {!submitted && (
        <div className="flex gap-2">
          <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate({ cycleId, rating: rating || undefined, overallComment: comment, submit: false })}>Save draft</Button>
          <Button disabled={!rating || !comment.trim()} loading={save.isPending} onClick={() => save.mutate({ cycleId, rating, overallComment: comment, submit: true })}>Submit</Button>
        </div>
      )}
    </Card>
  );
}

/* ───────────── My reviews (acknowledge) ───────────── */
function MyReviewsTab() {
  const reviews = useMyReviews();
  const ack = useAcknowledgeReview();
  if (reviews.isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (!reviews.data?.length) return <EmptyState icon={Award} title="No reviews yet" description="Your manager's performance reviews will appear here once submitted." />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {reviews.data.map((r) => (
        <Card key={r.id} className="rounded-xl p-4">
          <div className="flex items-center justify-between"><span className="text-xs text-text-faint">{r.cycle?.name}</span>{r.status === "ACKNOWLEDGED" ? <Badge variant="success">acknowledged</Badge> : <Badge variant="warning">new</Badge>}</div>
          {r.reviewer && <div className="mt-2"><PersonChip p={r.reviewer} /></div>}
          <div className="mt-3 flex items-center gap-2"><span className="text-xs text-text-muted">Rating</span>{r.rating ? <Stars value={Math.round(r.rating)} /> : <span className="text-xs text-text-faint">—</span>}</div>
          {r.promotionRecommended && <Badge variant="default" className="mt-2 gap-1"><Trophy className="size-3" /> Promotion recommended</Badge>}
          {r.comments && <p className="mt-2 text-sm text-text">{r.comments}</p>}
          {r.status === "SUBMITTED" && <Button size="sm" className="mt-3 w-full" loading={ack.isPending} onClick={() => ack.mutate(r.id)}><CheckCircle2 /> Acknowledge</Button>}
        </Card>
      ))}
    </div>
  );
}

/* ───────────── Team reviews (manager) ───────────── */
function ReviewDialog({ row, cycleId, onClose }: { row: TeamReviewRow | null; cycleId: string; onClose: () => void }) {
  const save = useSaveReview();
  const [rating, setRating] = React.useState(0);
  const [promo, setPromo] = React.useState(false);
  const [comments, setComments] = React.useState("");
  React.useEffect(() => { if (row?.review) { setRating(row.review.rating ?? 0); setPromo(row.review.promotionRecommended); setComments(row.review.comments ?? ""); } else { setRating(0); setPromo(false); setComments(""); } }, [row]);
  if (!row) return null;
  const submitted = row.review?.status === "SUBMITTED" || row.review?.status === "ACKNOWLEDGED";
  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Review · {row.employee.firstName} {row.employee.lastName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {row.self && <p className="text-xs text-text-muted">Self-rating: {row.self.rating ? `${row.self.rating}/5` : "—"} · self-review {row.self.status.toLowerCase()}</p>}
          <FormField label="Manager rating"><Stars value={rating} onChange={submitted ? undefined : setRating} /></FormField>
          <FormField label="Comments"><Textarea rows={5} value={comments} disabled={submitted} onChange={(e) => setComments(e.target.value)} placeholder="Strengths, impact, development areas…" /></FormField>
          <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" checked={promo} disabled={submitted} onChange={(e) => setPromo(e.target.checked)} /> Recommend for promotion</label>
        </div>
        {!submitted && (
          <DialogFooter>
            <Button variant="secondary" loading={save.isPending} onClick={async () => { await save.mutateAsync({ cycleId, employeeId: row.employee.id, rating: rating || undefined, promotionRecommended: promo, comments, submit: false }); onClose(); }}>Save draft</Button>
            <Button disabled={!rating || !comments.trim()} loading={save.isPending} onClick={async () => { await save.mutateAsync({ cycleId, employeeId: row.employee.id, rating, promotionRecommended: promo, comments, submit: true }); onClose(); }}>Submit review</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TeamTab({ cycleId }: { cycleId: string }) {
  const team = useTeamReviews(cycleId);
  const [editing, setEditing] = React.useState<TeamReviewRow | null>(null);
  if (team.isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (!team.data?.length) return <EmptyState icon={Users} title="No team members" description="You have no direct reports to review in this cycle." />;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {team.data.map((row) => {
          const st = row.review?.status;
          return (
            <Card key={row.employee.id} className="rounded-xl p-4 hover:shadow-raised transition-shadow cursor-pointer" onClick={() => setEditing(row)}>
              <div className="flex items-center justify-between"><PersonChip p={row.employee} />{st === "SUBMITTED" || st === "ACKNOWLEDGED" ? <Badge variant="success">{st.toLowerCase()}</Badge> : st === "IN_PROGRESS" ? <Badge variant="warning">draft</Badge> : <Badge variant="default">pending</Badge>}</div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-text-muted">Self: {row.self?.rating ? `${row.self.rating}/5` : row.self ? row.self.status.toLowerCase() : "not started"}</span>
                {row.review?.rating ? <Stars value={Math.round(row.review.rating)} /> : <span className="text-text-faint">no rating</span>}
              </div>
            </Card>
          );
        })}
      </div>
      <ReviewDialog row={editing} cycleId={cycleId} onClose={() => setEditing(null)} />
    </>
  );
}

/* ───────────── Dashboard (HR) ───────────── */
function DashboardTab({ cycleId }: { cycleId: string }) {
  const d = usePerfDashboard(cycleId);
  const top = useTopPerformers(cycleId);
  const promos = usePromotions(cycleId);
  const dd = d.data;
  const maxDist = Math.max(1, ...Object.values(dd?.ratingDistribution ?? {}));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Reviews submitted", value: dd ? `${dd.reviewsSubmitted}/${dd.reviewsTotal}` : undefined, accent: "text-primary dark:text-chart-3" },
          { label: "Avg rating", value: dd?.avgRating ?? "—", accent: "text-warning" },
          { label: "Goal completion", value: dd ? `${dd.goalCompletionPct}%` : undefined, accent: "text-success" },
          { label: "Promotion candidates", value: dd?.promotionCandidates, accent: "text-info" },
        ].map((c) => (
          <Card key={c.label} className="rounded-xl p-4"><p className={cn("text-xl font-semibold tabular-nums", c.accent)}>{d.isLoading ? <Skeleton className="h-7 w-12" /> : c.value ?? 0}</p><p className="text-[11px] uppercase tracking-wide text-text-muted">{c.label}</p></Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-xl p-4">
          <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><BarChart3 className="size-4 text-primary dark:text-chart-3" /> Rating distribution</p>
          <div className="space-y-2">
            {["5", "4", "3", "2", "1"].map((r) => (
              <div key={r} className="flex items-center gap-2 text-xs"><span className="w-8 text-text-muted">{r}★</span><div className="flex-1"><Bar pct={((dd?.ratingDistribution[r] ?? 0) / maxDist) * 100} /></div><span className="w-6 text-right tabular-nums text-text-muted">{dd?.ratingDistribution[r] ?? 0}</span></div>
            ))}
          </div>
        </Card>
        <Card className="rounded-xl p-4">
          <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><Trophy className="size-4 text-warning" /> Top performers</p>
          {!top.data?.length ? <p className="text-sm text-text-faint">No ratings yet.</p> : (
            <div className="space-y-2">{top.data.map((t) => <div key={t.employee.id} className="flex items-center justify-between gap-2"><PersonChip p={t.employee} /><span className="flex items-center gap-1 shrink-0"><Stars value={Math.round(t.rating)} />{t.promotionRecommended && <Trophy className="size-3.5 text-warning" />}</span></div>)}</div>
          )}
        </Card>
      </div>
      <Card className="rounded-xl p-4">
        <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><Trophy className="size-4 text-info" /> Promotion candidates</p>
        {!promos.data?.length ? <p className="text-sm text-text-faint">No promotion recommendations this cycle.</p> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{promos.data.map((p) => p.employee && (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5"><PersonChip p={p.employee} />{p.rating && <Badge variant="success">{p.rating}/5</Badge>}</div>
          ))}</div>
        )}
      </Card>
    </div>
  );
}

/* ───────────── Cycles (HR) ───────────── */
const CYCLE_FLOW: Record<string, string> = { DRAFT: "ACTIVE", ACTIVE: "REVIEW", REVIEW: "CALIBRATION", CALIBRATION: "CLOSED" };
function CyclesTab() {
  const cycles = useCycles();
  const create = useCreateCycle();
  const update = useUpdateCycle();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", startDate: "", endDate: "" });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus /> New Cycle</Button></div>
      {cycles.isLoading ? <Skeleton className="h-32 rounded-xl" /> : !cycles.data?.length ? (
        <EmptyState icon={CalendarRange} title="No appraisal cycles" description="Create a cycle (e.g. FY26 Annual) to kick off goal-setting and reviews." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cycles.data.map((c) => (
            <Card key={c.id} className="rounded-xl p-4">
              <div className="flex items-start justify-between"><p className="font-semibold text-text">{c.name}</p><Badge variant={statusVariant(c.status)}>{c.status.toLowerCase()}</Badge></div>
              <p className="text-xs text-text-muted mt-1">{formatDate(c.startDate)} – {formatDate(c.endDate)}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-faint">
                <span>{c._count?.goals ?? 0} goals</span><span>{c._count?.objectives ?? 0} OKRs</span><span>{c._count?.selfAssessments ?? 0} self</span><span>{c._count?.managerReviews ?? 0} reviews</span>
              </div>
              {CYCLE_FLOW[c.status] && <Button size="sm" variant="secondary" className="mt-3 w-full" loading={update.isPending} onClick={() => update.mutate({ id: c.id, status: CYCLE_FLOW[c.status]! })}>Advance to {CYCLE_FLOW[c.status]!.toLowerCase()}</Button>}
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New appraisal cycle</DialogTitle></DialogHeader>
          <FormField label="Name" required hint="e.g. FY26 Annual · H1 2026"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start date" required><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></FormField>
            <FormField label="End date" required><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.name || !form.startDate || !form.endDate} loading={create.isPending} onClick={async () => { await create.mutateAsync(form); setOpen(false); setForm({ name: "", startDate: "", endDate: "" }); }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────── Page ───────────── */
export function PerformancePage() {
  const { can } = usePermissions();
  const isManager = can("performance:approve", "performance:read_all", "performance:manage");
  const isHr = can("performance:manage", "performance:read_all");
  const cycles = useCycles();
  const [cycleId, setCycleId] = React.useState<string>("");

  React.useEffect(() => {
    if (!cycleId && cycles.data?.length) {
      const active = cycles.data.find((c) => c.status === "ACTIVE" || c.status === "REVIEW") ?? cycles.data[0];
      if (active) setCycleId(active.id);
    }
  }, [cycles.data, cycleId]);

  const noCycles = !cycles.isLoading && !cycles.data?.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text flex items-center gap-2"><Gauge className="size-5 text-primary dark:text-chart-3" /> Performance</h1>
          <p className="text-sm text-text-muted">Goals, OKRs, reviews and appraisals.</p>
        </div>
        {!noCycles && (
          <Select value={cycleId} onValueChange={setCycleId}>
            <SelectTrigger className="w-56" aria-label="Appraisal cycle"><SelectValue placeholder="Select cycle" /></SelectTrigger>
            <SelectContent>{(cycles.data ?? []).map((c: Cycle) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.status.toLowerCase()}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {noCycles ? (
        isHr ? <CyclesTab /> : <EmptyState icon={CalendarRange} title="No active appraisal cycle" description="Performance reviews open once HR creates an appraisal cycle." />
      ) : !cycleId ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <Tabs defaultValue="goals">
          <TabsList className="flex-wrap">
            <TabsTrigger value="goals"><Target /> My Goals</TabsTrigger>
            <TabsTrigger value="okrs"><TrendingUp /> My OKRs</TabsTrigger>
            <TabsTrigger value="self"><ClipboardList /> Self Review</TabsTrigger>
            <TabsTrigger value="reviews"><Award /> My Reviews</TabsTrigger>
            {isManager && <TabsTrigger value="team"><Users /> Team</TabsTrigger>}
            {isHr && <TabsTrigger value="dashboard"><BarChart3 /> Dashboard</TabsTrigger>}
            {isHr && <TabsTrigger value="cycles"><CalendarRange /> Cycles</TabsTrigger>}
          </TabsList>
          <TabsContent value="goals"><MyGoalsTab cycleId={cycleId} /></TabsContent>
          <TabsContent value="okrs"><MyOkrsTab cycleId={cycleId} /></TabsContent>
          <TabsContent value="self"><SelfReviewTab cycleId={cycleId} /></TabsContent>
          <TabsContent value="reviews"><MyReviewsTab /></TabsContent>
          {isManager && <TabsContent value="team"><TeamTab cycleId={cycleId} /></TabsContent>}
          {isHr && <TabsContent value="dashboard"><DashboardTab cycleId={cycleId} /></TabsContent>}
          {isHr && <TabsContent value="cycles"><CyclesTab /></TabsContent>}
        </Tabs>
      )}
    </div>
  );
}
