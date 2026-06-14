import * as React from "react";
import {
  AlertTriangle, Clock, Inbox, LifeBuoy, Lock, Plus, Send, Tag,
  Ticket as TicketIcon, User as UserIcon,
} from "lucide-react";
import {
  useAddComment, useAssignTicket, useCreateTicket, useHelpdeskSummary, useTicket,
  useTicketCategories, useTicketStatus, useTickets, type Ticket,
} from "./useHelpdesk";
import { useEmployees } from "@/features/employees/useEmployees";
import { useAuthStore } from "@/stores/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { cn, formatDateTime, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PRIORITY_VARIANT: Record<string, "default" | "info" | "warning" | "danger"> = {
  LOW: "default", MEDIUM: "info", HIGH: "warning", CRITICAL: "danger",
};
const PRIORITY_BAR: Record<string, string> = {
  LOW: "bg-border-strong", MEDIUM: "bg-info", HIGH: "bg-warning", CRITICAL: "bg-danger",
};

/** Zendesk-style "views" — filter the ticket queue by lifecycle state. */
const VIEWS: Array<{ key: string; label: string; match: (s: string) => boolean }> = [
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Open", match: (s) => s === "OPEN" },
  { key: "active", label: "In progress", match: (s) => s === "IN_PROGRESS" },
  { key: "hold", label: "On hold", match: (s) => s === "ON_HOLD" },
  { key: "solved", label: "Solved", match: (s) => s === "RESOLVED" || s === "CLOSED" },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TicketRow({ t, active, onClick }: { t: Ticket; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors",
        active ? "bg-primary/5" : "hover:bg-surface-sunken",
      )}
    >
      <span className={cn("h-9 w-1 shrink-0 rounded-full", PRIORITY_BAR[t.priority])} aria-hidden />
      <Avatar size="sm">{t.requester.photoUrl && <AvatarImage src={t.requester.photoUrl} alt="" />}<AvatarFallback>{initials(t.requester.firstName, t.requester.lastName)}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-text">{t.subject}</p>
          {t.slaBreached && <AlertTriangle className="size-3.5 shrink-0 text-danger" />}
        </div>
        <p className="truncate text-[11px] text-text-muted">
          <span className="font-mono">{t.ticketNumber}</span> · {t.category.department} · {t.requester.firstName} {t.requester.lastName} · {timeAgo(t.createdAt)}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <Badge variant={PRIORITY_VARIANT[t.priority]} className="text-[10px]">{t.priority}</Badge>
        <Badge variant={statusVariant(t.status)} className="text-[10px]">{t.status.replace("_", " ")}</Badge>
        {t.assignee ? (
          <Avatar size="sm"><AvatarFallback className="text-[9px]">{initials(t.assignee.firstName, t.assignee.lastName)}</AvatarFallback></Avatar>
        ) : (
          <span className="w-7 text-center text-[10px] text-text-faint">—</span>
        )}
      </div>
    </button>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-faint mb-1">{label}</p>
      {children}
    </div>
  );
}

export function HelpdeskPage() {
  const { can } = usePermissions();
  const isAgent = can("helpdesk:assign", "helpdesk:manage");
  const summary = useHelpdeskSummary(isAgent);
  const [scope, setScope] = React.useState(isAgent ? "all" : "mine");
  const [view, setView] = React.useState("all");
  const tickets = useTickets({ scope });
  const categories = useTicketCategories();
  const employees = useEmployees({ page: 1, limit: 100, status: "ACTIVE" });
  const createTicket = useCreateTicket();
  const addComment = useAddComment();
  const assignTicket = useAssignTicket();
  const statusMut = useTicketStatus();
  const myUserId = useAuthStore((s) => s.user?.id);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({ categoryId: "", subject: "", description: "", priority: "MEDIUM" });
  const [openId, setOpenId] = React.useState<string | null>(null);
  const ticket = useTicket(openId);
  const [reply, setReply] = React.useState("");
  const [internal, setInternal] = React.useState(false);

  const all = tickets.data?.tickets ?? [];
  const activeView = VIEWS.find((v) => v.key === view) ?? VIEWS[0]!;
  const list = all.filter((t) => activeView.match(t.status));
  const counts = Object.fromEntries(VIEWS.map((v) => [v.key, all.filter((t) => v.match(t.status)).length]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Helpdesk</h1>
          <p className="text-sm text-text-muted">Support tickets across HR, IT, Finance and Admin.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus /> New ticket</Button>
      </div>

      {isAgent && summary.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Open", value: summary.data.open, accent: "text-info" },
            { label: "SLA breached", value: summary.data.slaBreached, accent: "text-danger" },
            { label: "Critical", value: summary.data.byPriority["CRITICAL"] ?? 0, accent: "text-danger" },
            { label: "Resolved", value: summary.data.byStatus["RESOLVED"] ?? 0, accent: "text-success" },
          ].map((c) => (
            <Card key={c.label} className="rounded-xl p-4">
              <p className={cn("text-xl font-semibold tabular-nums", c.accent)}>{c.value}</p>
              <p className="text-[11px] uppercase tracking-wide text-text-muted mt-0.5">{c.label}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="rounded-xl overflow-hidden">
        {/* views toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-sunken/60 px-3 py-2">
          <Inbox className="size-4 text-text-muted mr-1" />
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                view === v.key ? "bg-primary text-white" : "text-text-muted hover:bg-surface",
              )}
            >
              {v.label} <span className={cn("tabular-nums", view === v.key ? "text-white/80" : "text-text-faint")}>{counts[v.key]}</span>
            </button>
          ))}
          <div className="flex-1" />
          {isAgent && (
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="h-8 w-36" aria-label="Scope"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tickets</SelectItem>
                <SelectItem value="mine">Assigned to me</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* ticket list */}
        {tickets.isLoading ? (
          <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
        ) : tickets.isError ? (
          <div className="p-4"><ErrorState message={apiErrorMessage(tickets.error)} onRetry={() => tickets.refetch()} /></div>
        ) : !list.length ? (
          <EmptyState icon={LifeBuoy} title="No tickets in this view" description="Raise a ticket or switch views." />
        ) : (
          <div>{list.map((t) => <TicketRow key={t.id} t={t} active={t.id === openId} onClick={() => setOpenId(t.id)} />)}</div>
        )}
      </Card>

      {/* create ticket */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New ticket</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Category" required>
              <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                <SelectTrigger aria-label="Category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.department} · {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Subject" required><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Brief summary" /></FormField>
            <FormField label="Description" required><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the issue in detail" /></FormField>
            <FormField label="Priority">
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
                <SelectContent>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.categoryId || form.subject.length < 3 || form.description.length < 5}
              loading={createTicket.isPending}
              onClick={async () => {
                await createTicket.mutateAsync(form);
                setCreateOpen(false);
                setForm({ categoryId: "", subject: "", description: "", priority: "MEDIUM" });
              }}
            >
              Submit ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ticket detail — Zendesk-style: conversation + properties sidebar */}
      <Sheet open={Boolean(openId)} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="max-w-3xl p-0">
          {ticket.data ? (
            <>
              <SheetHeader className="border-b border-border px-5 py-3 pr-10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-text-faint">{ticket.data.ticketNumber}</span>
                  <Badge variant={PRIORITY_VARIANT[ticket.data.priority]}>{ticket.data.priority}</Badge>
                  <Badge variant={statusVariant(ticket.data.status)}>{ticket.data.status.replace("_", " ")}</Badge>
                  {ticket.data.slaBreached && <Badge variant="danger"><AlertTriangle className="size-3" /> SLA</Badge>}
                </div>
                <SheetTitle className="mt-1 text-base">{ticket.data.subject}</SheetTitle>
              </SheetHeader>

              <SheetBody className="p-0">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_15rem]">
                  {/* conversation */}
                  <div className="flex max-h-[calc(92vh-7rem)] flex-col border-r border-border">
                    <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin p-4">
                      {/* original request as first message */}
                      <Message
                        name={`${ticket.data.requester.firstName} ${ticket.data.requester.lastName}`}
                        photoUrl={ticket.data.requester.photoUrl}
                        time={ticket.data.createdAt}
                        body={ticket.data.description}
                        mine={false}
                        requester
                      />
                      {(ticket.data.comments ?? []).map((c) => (
                        <Message
                          key={c.id}
                          name={c.authorId === myUserId ? "You" : "Agent"}
                          photoUrl={null}
                          time={c.createdAt}
                          body={c.body}
                          mine={c.authorId === myUserId}
                          internal={c.isInternal}
                        />
                      ))}
                    </div>

                    {/* composer */}
                    {ticket.data.status !== "CLOSED" && (
                      <div className="border-t border-border p-3 space-y-2 bg-surface">
                        {isAgent && (
                          <div className="flex gap-1 text-xs">
                            <button onClick={() => setInternal(false)} className={cn("rounded-md px-2 py-1 font-medium", !internal ? "bg-primary text-white" : "text-text-muted hover:bg-surface-sunken")}>Public reply</button>
                            <button onClick={() => setInternal(true)} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium", internal ? "bg-warning text-white" : "text-text-muted hover:bg-surface-sunken")}><Lock className="size-3" /> Internal note</button>
                          </div>
                        )}
                        <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={internal ? "Add an internal note…" : "Write a reply…"} className={cn(internal && "bg-warning/5")} />
                        <div className="flex justify-end">
                          <Button size="sm" disabled={reply.trim().length === 0} loading={addComment.isPending}
                            onClick={async () => { await addComment.mutateAsync({ id: ticket.data!.id, body: reply, isInternal: internal }); setReply(""); }}>
                            <Send /> {internal ? "Add note" : "Send reply"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* properties sidebar */}
                  <aside className="space-y-4 p-4 bg-surface-sunken/40">
                    <PropRow label="Requester">
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">{ticket.data.requester.photoUrl && <AvatarImage src={ticket.data.requester.photoUrl} alt="" />}<AvatarFallback>{initials(ticket.data.requester.firstName, ticket.data.requester.lastName)}</AvatarFallback></Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text">{ticket.data.requester.firstName} {ticket.data.requester.lastName}</p>
                          <p className="truncate text-[10px] font-mono text-text-faint">{ticket.data.requester.employeeCode}</p>
                        </div>
                      </div>
                    </PropRow>

                    <PropRow label="Status">
                      {isAgent ? (
                        <Select value={ticket.data.status} onValueChange={(v) => statusMut.mutate({ id: ticket.data!.id, status: v })}>
                          <SelectTrigger className="h-8" aria-label="Status"><SelectValue /></SelectTrigger>
                          <SelectContent>{["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : <Badge variant={statusVariant(ticket.data.status)}>{ticket.data.status.replace("_", " ")}</Badge>}
                    </PropRow>

                    <PropRow label="Assignee">
                      {isAgent ? (
                        <Select value={ticket.data.assignee?.id ?? ""} onValueChange={(v) => assignTicket.mutate({ id: ticket.data!.id, assigneeId: v })}>
                          <SelectTrigger className="h-8" aria-label="Assignee"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                          <SelectContent>{(employees.data?.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <p className="flex items-center gap-1.5 text-sm text-text"><UserIcon className="size-3.5 text-text-faint" />{ticket.data.assignee ? `${ticket.data.assignee.firstName} ${ticket.data.assignee.lastName}` : "Unassigned"}</p>
                      )}
                    </PropRow>

                    <PropRow label="Priority">
                      <Badge variant={PRIORITY_VARIANT[ticket.data.priority]}>{ticket.data.priority}</Badge>
                    </PropRow>

                    <PropRow label="Category">
                      <p className="flex items-center gap-1.5 text-sm text-text"><Tag className="size-3.5 text-text-faint" />{ticket.data.category.department} · {ticket.data.category.name}</p>
                    </PropRow>

                    <PropRow label="Opened">
                      <p className="flex items-center gap-1.5 text-xs text-text-muted"><Clock className="size-3.5 text-text-faint" />{formatDateTime(ticket.data.createdAt)}</p>
                    </PropRow>
                  </aside>
                </div>
              </SheetBody>
            </>
          ) : (
            <div className="p-5"><Skeleton className="h-40 w-full" /></div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Message({
  name, photoUrl, time, body, mine, internal, requester,
}: { name: string; photoUrl: string | null; time: string; body: string; mine: boolean; internal?: boolean; requester?: boolean }) {
  return (
    <div className="flex gap-2.5">
      <Avatar size="sm" className="mt-0.5 shrink-0">{photoUrl && <AvatarImage src={photoUrl} alt="" />}<AvatarFallback className="text-[10px]">{initials(...(name.split(" ") as [string, string]))}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text">{name}</span>
          {requester && <Badge className="text-[9px]">Requester</Badge>}
          {internal && <Badge variant="warning" className="text-[9px]"><Lock className="size-2.5" /> Internal note</Badge>}
          <span className="text-[10px] text-text-faint">{timeAgo(time)}</span>
        </div>
        <div className={cn("mt-1 rounded-lg border px-3 py-2 text-sm text-text whitespace-pre-wrap", internal ? "border-warning/30 bg-warning/5" : mine ? "border-primary/20 bg-primary/5" : "border-border bg-surface")}>
          {body}
        </div>
      </div>
    </div>
  );
}

export { TicketIcon };
