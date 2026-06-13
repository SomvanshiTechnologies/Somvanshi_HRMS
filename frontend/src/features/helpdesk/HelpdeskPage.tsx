import * as React from "react";
import { AlertTriangle, LifeBuoy, MessageSquare, Plus, Send, Ticket as TicketIcon } from "lucide-react";
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
const BOARD_COLUMNS = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED"];

function TicketCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-lg border border-border bg-surface p-3 text-left shadow-card hover:shadow-raised transition-shadow cursor-pointer">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-text-faint">{ticket.ticketNumber}</span>
        <Badge variant={PRIORITY_VARIANT[ticket.priority]} className="text-[10px]">{ticket.priority}</Badge>
      </div>
      <p className="mt-1 text-sm font-medium text-text line-clamp-2">{ticket.subject}</p>
      <div className="mt-2 flex items-center justify-between">
        <Badge className="text-[10px]">{ticket.category.name}</Badge>
        {ticket.assignee ? (
          <Avatar size="sm">
            {ticket.assignee.photoUrl && <AvatarImage src={ticket.assignee.photoUrl} alt="" />}
            <AvatarFallback>{initials(ticket.assignee.firstName, ticket.assignee.lastName)}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="text-[10px] text-text-faint">Unassigned</span>
        )}
      </div>
      {ticket.slaBreached && <p className="mt-1 flex items-center gap-1 text-[10px] text-danger"><AlertTriangle className="size-3" /> SLA breached</p>}
    </button>
  );
}

export function HelpdeskPage() {
  const { can } = usePermissions();
  const isAgent = can("helpdesk:assign", "helpdesk:manage");
  const summary = useHelpdeskSummary(isAgent);
  const [scope, setScope] = React.useState(isAgent ? "all" : "mine");
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

  const list = tickets.data?.tickets ?? [];
  const board = BOARD_COLUMNS.map((status) => ({ status, items: list.filter((t) => t.status === status) }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Helpdesk</h1>
          <p className="text-sm text-text-muted">Raise and track support tickets across HR, IT, Finance and Admin.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus /> Raise Ticket</Button>
      </div>

      {/* agent summary */}
      {isAgent && summary.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Open", value: summary.data.open, accent: "text-info" },
            { label: "SLA Breached", value: summary.data.slaBreached, accent: "text-danger" },
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

      {isAgent && (
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-44 h-9" aria-label="Scope"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tickets</SelectItem>
            <SelectItem value="mine">My tickets</SelectItem>
          </SelectContent>
        </Select>
      )}

      {tickets.isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : tickets.isError ? (
        <ErrorState message={apiErrorMessage(tickets.error)} onRetry={() => tickets.refetch()} />
      ) : !list.length ? (
        <EmptyState icon={LifeBuoy} title="No tickets" description="Raise a ticket and it'll appear on the board." />
      ) : (
        <div className="overflow-x-auto scrollbar-thin pb-2">
          <div className="flex gap-3 min-w-max">
            {board.map((col) => (
              <div key={col.status} className="w-64 shrink-0 rounded-xl border border-border bg-surface-sunken/60">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{col.status.replace("_", " ")}</p>
                  <Badge className="text-[10px]">{col.items.length}</Badge>
                </div>
                <div className="space-y-2 px-2.5 pb-3 min-h-20">
                  {col.items.map((t) => <TicketCard key={t.id} ticket={t} onClick={() => setOpenId(t.id)} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* create ticket */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise a ticket</DialogTitle></DialogHeader>
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

      {/* ticket detail */}
      <Sheet open={Boolean(openId)} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="max-w-lg">
          {ticket.data && (
            <>
              <SheetHeader className="pr-10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-text-faint">{ticket.data.ticketNumber}</span>
                  <Badge variant={PRIORITY_VARIANT[ticket.data.priority]}>{ticket.data.priority}</Badge>
                  <Badge variant={statusVariant(ticket.data.status)}>{ticket.data.status.replace("_", " ")}</Badge>
                </div>
                <SheetTitle className="mt-1">{ticket.data.subject}</SheetTitle>
                <p className="text-xs text-text-muted">{ticket.data.category.department} · {ticket.data.category.name}</p>
              </SheetHeader>
              <SheetBody className="space-y-4">
                <p className="text-sm text-text whitespace-pre-wrap">{ticket.data.description}</p>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Avatar size="sm">
                    {ticket.data.requester.photoUrl && <AvatarImage src={ticket.data.requester.photoUrl} alt="" />}
                    <AvatarFallback>{initials(ticket.data.requester.firstName, ticket.data.requester.lastName)}</AvatarFallback>
                  </Avatar>
                  Raised by {ticket.data.requester.firstName} {ticket.data.requester.lastName} · {formatDateTime(ticket.data.createdAt)}
                </div>

                {/* agent actions */}
                {isAgent && (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Select value={ticket.data.assignee?.id ?? ""} onValueChange={(v) => assignTicket.mutate({ id: ticket.data!.id, assigneeId: v })}>
                        <SelectTrigger className="h-8 flex-1" aria-label="Assign"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                        <SelectContent>
                          {(employees.data?.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={ticket.data.status} onValueChange={(v) => statusMut.mutate({ id: ticket.data!.id, status: v })}>
                        <SelectTrigger className="h-8 w-36" aria-label="Status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* conversation */}
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted flex items-center gap-1.5"><MessageSquare className="size-3.5" /> Conversation</p>
                  {(ticket.data.comments ?? []).length === 0 && <p className="text-sm text-text-faint">No replies yet.</p>}
                  {(ticket.data.comments ?? []).map((c) => (
                    <div key={c.id} className={cn("rounded-lg p-2.5 text-sm", c.authorId === myUserId ? "bg-primary/10 ml-6" : "bg-surface-sunken mr-6")}>
                      {c.isInternal && <Badge variant="warning" className="text-[9px] mb-1">Internal note</Badge>}
                      <p className="text-text whitespace-pre-wrap">{c.body}</p>
                      <p className="text-[10px] text-text-faint mt-1">{formatDateTime(c.createdAt)}</p>
                    </div>
                  ))}
                </div>

                {/* reply */}
                {!["CLOSED"].includes(ticket.data.status) && (
                  <div className="space-y-2">
                    <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type a reply…" />
                    <div className="flex items-center justify-between">
                      {isAgent && (
                        <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                          <input type="checkbox" className="size-3.5 accent-(--brand-primary)" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                          Internal note
                        </label>
                      )}
                      <Button
                        size="sm" className="ml-auto"
                        disabled={reply.trim().length === 0}
                        loading={addComment.isPending}
                        onClick={async () => { await addComment.mutateAsync({ id: ticket.data!.id, body: reply, isInternal: internal }); setReply(""); setInternal(false); }}
                      >
                        <Send /> Reply
                      </Button>
                    </div>
                  </div>
                )}
              </SheetBody>
            </>
          )}
          {ticket.isLoading && <div className="p-5"><Skeleton className="h-40 w-full" /></div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export { TicketIcon };
