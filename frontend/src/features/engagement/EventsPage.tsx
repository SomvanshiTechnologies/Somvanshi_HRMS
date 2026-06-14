import * as React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Cake, Gift, Heart, PartyPopper, Plus, Sparkles, Trophy, UserPlus,
} from "lucide-react";
import {
  RECOGNITION_BADGES, useCheer, useDeleteRecognition, useGiveRecognition,
  useLeaderboard, useNewJoiners, useRecognitions, type Recognition,
} from "./useEngagement";
import { useCelebrations } from "@/features/dashboard/useDashboard";
import { useEmployees } from "@/features/employees/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/stores/auth";
import { cn, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";

function PersonAvatar({ p, size = "sm" }: { p: { firstName: string; lastName: string; photoUrl: string | null; id?: string }; size?: "sm" | "md" }) {
  return (
    <Avatar size={size}>
      {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
      <AvatarFallback>{initials(p.firstName, p.lastName)}</AvatarFallback>
    </Avatar>
  );
}

/* ───────────────── give recognition ───────────────── */
function GiveDialog({ open, onOpenChange, presetTo }: { open: boolean; onOpenChange: (o: boolean) => void; presetTo?: string }) {
  const employees = useEmployees({ page: 1, limit: 200, status: "ACTIVE" });
  const give = useGiveRecognition();
  const me = useAuthStore((s) => s.user);
  const [form, setForm] = React.useState({ toEmployeeId: presetTo ?? "", badge: "KUDOS", message: "", isPublic: true });
  React.useEffect(() => { if (presetTo) setForm((f) => ({ ...f, toEmployeeId: presetTo })); }, [presetTo]);
  const reset = () => setForm({ toEmployeeId: "", badge: "KUDOS", message: "", isPublic: true });
  const valid = form.toEmployeeId && form.message.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary dark:text-chart-3" /> Give Recognition</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormField label="Recognise" required>
            <Select value={form.toEmployeeId} onValueChange={(v) => setForm({ ...form, toEmployeeId: v })}>
              <SelectTrigger aria-label="Employee"><SelectValue placeholder="Select a colleague" /></SelectTrigger>
              <SelectContent>
                {(employees.data?.data ?? []).filter((e) => e.id !== me?.employee?.id).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.employeeCode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Badge" required>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(RECOGNITION_BADGES).map(([key, b]) => (
                <button
                  key={key} type="button" onClick={() => setForm({ ...form, badge: key })}
                  className={cn("flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] transition-colors cursor-pointer", form.badge === key ? "border-primary bg-primary/10 text-primary dark:text-chart-3" : "border-border text-text-muted hover:bg-surface-sunken")}
                >
                  <span className="text-lg leading-none">{b.emoji}</span>{b.label}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Message" required><Textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Say something specific and genuine…" /></FormField>
          <label className="flex items-center gap-2 text-sm text-text-muted"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Share on the public wall</label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          <Button disabled={!valid} loading={give.isPending} onClick={async () => { await give.mutateAsync(form); onOpenChange(false); reset(); }}>Share recognition</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────── recognition card ───────────────── */
function RecognitionCard({ r }: { r: Recognition }) {
  const cheer = useCheer();
  const del = useDeleteRecognition();
  const me = useAuthStore((s) => s.user);
  const badge = RECOGNITION_BADGES[r.badge] ?? RECOGNITION_BADGES["KUDOS"]!;
  const mine = r.from.id === me?.employee?.id;
  return (
    <Card className="rounded-xl p-4">
      <div className="flex items-center justify-between">
        <Badge variant="default" className="gap-1">{badge.emoji} {badge.label}</Badge>
        <span className="text-[11px] text-text-faint">{formatDate(r.createdAt)}</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link to={`/employees/${r.to.id}`}><PersonAvatar p={r.to} /></Link>
        <div className="min-w-0">
          <Link to={`/employees/${r.to.id}`} className="font-semibold text-text hover:underline truncate block">{r.to.firstName} {r.to.lastName}</Link>
          <p className="text-[11px] text-text-faint">{r.to.designation?.title ?? r.to.employeeCode}</p>
        </div>
      </div>
      <p className="mt-2.5 text-sm text-text">{r.message}</p>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          <PersonAvatar p={r.from} /> <span className="truncate">by {r.from.firstName}</span>
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => cheer.mutate(r.id)} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors cursor-pointer", r.cheered ? "bg-danger/10 text-danger" : "text-text-muted hover:bg-surface-sunken")} aria-label="Cheer">
            <Heart className={cn("size-3.5", r.cheered && "fill-current")} /> {r.cheerCount > 0 && r.cheerCount}
          </button>
          {mine && <button onClick={() => del.mutate(r.id)} className="text-[11px] text-text-faint hover:text-danger cursor-pointer">remove</button>}
        </div>
      </div>
    </Card>
  );
}

/* ───────────────── tabs content ───────────────── */
function WallTab({ onGive }: { onGive: () => void }) {
  const [scope, setScope] = React.useState<"feed" | "received" | "given">("feed");
  const recognitions = useRecognitions(scope);
  const leaderboard = useLeaderboard();

  return (
    <div className="space-y-4">
      {/* leaderboard */}
      {(leaderboard.data?.length ?? 0) > 0 && (
        <Card className="rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1.5"><Trophy className="size-3.5 text-warning" /> Most recognised this month</p>
          <div className="flex flex-wrap gap-3">
            {leaderboard.data!.map((l, i) => (
              <Link key={l.employee.id} to={`/employees/${l.employee.id}`} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 hover:bg-surface-sunken transition-colors">
                <span className="text-sm font-bold text-text-faint w-4">{i + 1}</span>
                <PersonAvatar p={l.employee} />
                <div className="min-w-0"><p className="text-sm font-medium text-text truncate">{l.employee.firstName} {l.employee.lastName}</p><p className="text-[11px] text-text-faint">{l.count} recognition{l.count === 1 ? "" : "s"}</p></div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
          <SelectTrigger className="w-44 h-9" aria-label="Scope"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="feed">All recognition</SelectItem>
            <SelectItem value="received">Received by me</SelectItem>
            <SelectItem value="given">Given by me</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={onGive}><Plus /> Give Recognition</Button>
      </div>

      {recognitions.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
      ) : !recognitions.data?.length ? (
        <EmptyState icon={Sparkles} title="No recognition yet" description="Be the first to celebrate a colleague's great work." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {recognitions.data.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
              <RecognitionCard r={r} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonRow({ p, meta, accent, onCheer }: { p: { id: string; firstName: string; lastName: string; photoUrl: string | null; designation: string | null; department: string | null }; meta: React.ReactNode; accent: string; onCheer?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <Link to={`/employees/${p.id}`}><PersonAvatar p={p} size="md" /></Link>
      <div className="min-w-0 flex-1">
        <Link to={`/employees/${p.id}`} className="font-medium text-text hover:underline truncate block">{p.firstName} {p.lastName}</Link>
        <p className="text-xs text-text-muted truncate">{p.designation ?? ""}{p.department ? ` · ${p.department}` : ""}</p>
      </div>
      <span className={cn("text-xs font-medium", accent)}>{meta}</span>
      {onCheer && <Button size="sm" variant="secondary" onClick={onCheer}><Gift className="size-3.5" /> Wish</Button>}
    </div>
  );
}

function CelebrationsTab({ onWish }: { onWish: (id: string) => void }) {
  const cel = useCelebrations();
  if (cel.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  const birthdays = cel.data?.birthdays ?? [];
  const anniversaries = cel.data?.anniversaries ?? [];
  if (!birthdays.length && !anniversaries.length) return <EmptyState icon={Cake} title="No upcoming celebrations" description="Birthdays and work anniversaries in the next two weeks will appear here." />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="rounded-xl p-4">
        <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><Cake className="size-4 text-warning" /> Birthdays</p>
        {birthdays.length ? (
          <div className="space-y-2">
            {birthdays.map((b) => <PersonRow key={b.id} p={b} accent={b.isToday ? "text-warning" : "text-text-muted"} meta={b.isToday ? "🎂 Today" : formatDate(b.date)} onCheer={() => onWish(b.id)} />)}
          </div>
        ) : <p className="text-sm text-text-faint">No birthdays coming up.</p>}
      </Card>
      <Card className="rounded-xl p-4">
        <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><PartyPopper className="size-4 text-success" /> Work Anniversaries</p>
        {anniversaries.length ? (
          <div className="space-y-2">
            {anniversaries.map((a) => <PersonRow key={a.id} p={a} accent={a.isMilestone ? "text-success font-bold" : "text-text-muted"} meta={`${a.years}y${a.isMilestone ? " 🏆" : ""}`} onCheer={() => onWish(a.id)} />)}
          </div>
        ) : <p className="text-sm text-text-faint">No anniversaries coming up.</p>}
      </Card>
    </div>
  );
}

function NewJoinersTab({ onWelcome }: { onWelcome: (id: string) => void }) {
  const joiners = useNewJoiners(45);
  if (joiners.isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (!joiners.data?.length) return <EmptyState icon={UserPlus} title="No recent joiners" description="New team members from the last 45 days will show here." />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {joiners.data.map((j) => (
        <Card key={j.id} className="rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Link to={`/employees/${j.id}`}><PersonAvatar p={j} size="md" /></Link>
            <div className="min-w-0">
              <Link to={`/employees/${j.id}`} className="font-semibold text-text hover:underline truncate block">{j.firstName} {j.lastName}</Link>
              <p className="text-xs text-text-muted truncate">{j.designation?.title ?? ""}{j.department ? ` · ${j.department.name}` : ""}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
            <span className="text-[11px] text-text-faint">Joined {formatDate(j.dateOfJoining)}</span>
            <Button size="sm" variant="secondary" onClick={() => onWelcome(j.id)}>🎊 Welcome</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ───────────────── page ───────────────── */
export function EventsPage() {
  const { can } = usePermissions();
  const cel = useCelebrations();
  const joiners = useNewJoiners(45);
  const [giveOpen, setGiveOpen] = React.useState(false);
  const [presetTo, setPresetTo] = React.useState<string | undefined>(undefined);

  const openGive = (to?: string) => { setPresetTo(to); setGiveOpen(true); };
  const birthdaysToday = (cel.data?.birthdays ?? []).filter((b) => b.isToday).length;

  const stats = [
    { label: "Birthdays today", value: birthdaysToday, icon: Cake, accent: "text-warning" },
    { label: "Upcoming birthdays", value: cel.data?.birthdays.length ?? 0, icon: Gift, accent: "text-primary dark:text-chart-3" },
    { label: "Anniversaries", value: cel.data?.anniversaries.length ?? 0, icon: PartyPopper, accent: "text-success" },
    { label: "New joiners (45d)", value: joiners.data?.length ?? 0, icon: UserPlus, accent: "text-info" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Celebrations &amp; Recognition</h1>
          <p className="text-sm text-text-muted">Birthdays, work anniversaries, new joiners and a peer recognition wall.</p>
        </div>
        {can("recognition:create") && <Button onClick={() => openGive()}><Sparkles /> Give Recognition</Button>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-xl p-4 flex items-center gap-3">
            <div className={cn("rounded-lg bg-surface-sunken p-2.5", s.accent)}><s.icon className="size-5" /></div>
            <div><p className={cn("text-xl font-semibold tabular-nums", s.accent)}>{s.value}</p><p className="text-[11px] uppercase tracking-wide text-text-muted">{s.label}</p></div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="wall">
        <TabsList>
          <TabsTrigger value="wall"><Sparkles /> Recognition Wall</TabsTrigger>
          <TabsTrigger value="celebrations"><Cake /> Celebrations</TabsTrigger>
          <TabsTrigger value="joiners"><UserPlus /> New Joiners</TabsTrigger>
        </TabsList>
        <TabsContent value="wall"><WallTab onGive={() => openGive()} /></TabsContent>
        <TabsContent value="celebrations"><CelebrationsTab onWish={(id) => openGive(id)} /></TabsContent>
        <TabsContent value="joiners"><NewJoinersTab onWelcome={(id) => openGive(id)} /></TabsContent>
      </Tabs>

      <GiveDialog open={giveOpen} onOpenChange={setGiveOpen} presetTo={presetTo} />
    </div>
  );
}
