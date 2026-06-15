import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, Bot, CalendarCheck2, CalendarPlus, Cake, ClipboardCheck, FileText,
  Home, LayoutGrid, LifeBuoy, Plus, SendHorizonal, TrendingUp, Trash2,
  UserSearch, Users, Wallet,
} from "lucide-react";
import { ChatThread, type ChatThreadHandle } from "./ChatThread";
import {
  useAiStatus, useConversations, useCreateConversation, useDeleteConversation,
} from "./useSomAI";
import { useOverview, useCelebrations } from "@/features/dashboard/useDashboard";
import { useMyBalances } from "@/features/leave/useLeave";
import { useHelpdeskSummary } from "@/features/helpdesk/useHelpdesk";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/stores/auth";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";

/* ---------- quick action workflow cards ---------- */
interface QuickAction { label: string; sublabel: string; icon: typeof Wallet; prompt: string; accent: string; show: boolean }

function useQuickActions(): QuickAction[] {
  const { can } = usePermissions();
  return [
    { label: "Apply Leave", sublabel: "Book time off in seconds", icon: CalendarPlus, prompt: "I want to apply for leave. Ask me for the details.", accent: "from-primary to-(--chart-2)", show: can("leave:create") },
    { label: "Check Attendance", sublabel: "Your hours this month", icon: CalendarCheck2, prompt: "Show my attendance summary for this month.", accent: "from-(--chart-2) to-(--chart-3)", show: can("attendance:read") },
    { label: "View Payslips", sublabel: "Download your payslips", icon: Wallet, prompt: "List my payslips with download links.", accent: "from-secondary to-primary", show: can("payroll:read") },
    { label: "Create Ticket", sublabel: "Get help from HR/IT", icon: LifeBuoy, prompt: "I need to raise a support ticket. Help me create one.", accent: "from-(--chart-4) to-warning", show: can("helpdesk:create") },
    { label: "Search Employee", sublabel: "Find anyone instantly", icon: UserSearch, prompt: "Search the employee directory for ", accent: "from-(--chart-6) to-primary", show: can("employees:read_all") },
    { label: "HR Analytics", sublabel: "Org-wide insights", icon: TrendingUp, prompt: "Give me the organization HR analytics overview.", accent: "from-success to-(--chart-2)", show: can("analytics:read_all") },
  ].filter((a) => a.show);
}

/* ---------- today's summary + insights ---------- */
function SummaryStat({ icon: Icon, label, value, accent, to }: { icon: typeof Users; label: string; value: React.ReactNode; accent: string; to?: string }) {
  return (
    <Card className="rounded-xl p-3.5 flex items-center gap-3">
      <div className={cn("rounded-lg p-2.5", accent)}><Icon className="size-5" /></div>
      <div className="min-w-0">
        <p className="text-lg font-semibold text-text tabular-nums leading-tight">{value}</p>
        <p className="text-[11px] text-text-muted">{label}{to}</p>
      </div>
    </Card>
  );
}

function CommandCenter({ onLaunch }: { onLaunch: (prompt: string) => void }) {
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);
  const actions = useQuickActions();
  const isHrView = can("analytics:read");
  const overview = useOverview();
  const celebrations = useCelebrations();
  const helpdesk = useHelpdeskSummary(can("helpdesk:assign", "helpdesk:manage"));
  const balances = useMyBalances();

  const o = overview.data;
  const birthdaysToday = (celebrations.data?.birthdays ?? []).filter((b) => b.isToday).length;
  const birthdaysSoon = celebrations.data?.birthdays.length ?? 0;

  // live insights derived from real data
  const insights: Array<{ text: string; tone: "info" | "warning" | "success" }> = [];
  if (isHrView && o) {
    if (o.pendingLeaveRequests > 0) insights.push({ text: `${o.pendingLeaveRequests} leave ${o.pendingLeaveRequests === 1 ? "request requires" : "requests require"} approval`, tone: "warning" });
    if (birthdaysToday > 0) insights.push({ text: `${birthdaysToday} ${birthdaysToday === 1 ? "employee has a birthday" : "employees have birthdays"} today`, tone: "success" });
    if (o.attendancePctToday < 80 && o.activeEmployees > 0) insights.push({ text: `Attendance is ${o.attendancePctToday}% today — below target`, tone: "warning" });
    if (o.openPositions > 0) insights.push({ text: `${o.openPositions} open ${o.openPositions === 1 ? "position" : "positions"} in the hiring pipeline`, tone: "info" });
    if (helpdesk.data?.slaBreached) insights.push({ text: `${helpdesk.data.slaBreached} tickets have breached SLA`, tone: "warning" });
  } else if (balances.data) {
    const cl = balances.data.find((b) => b.leaveType.code === "CL");
    if (cl) insights.push({ text: `You have ${cl.available} casual leave days available`, tone: "info" });
    if (birthdaysSoon > 0) insights.push({ text: `${birthdaysSoon} ${birthdaysSoon === 1 ? "teammate has a birthday" : "teammates have birthdays"} coming up`, tone: "success" });
  }

  return (
    <div className="flex-1 p-5 space-y-5">
      {/* greeting */}
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-(--chart-2) p-3 text-white shadow-card"><Bot className="size-6" /></div>
        <div>
          <h2 className="text-lg font-semibold text-text">Hello {user?.employee?.firstName ?? "there"}, I'm Sera</h2>
          <p className="text-sm text-text-muted">Your HR copilot — pick an action or ask me anything about your live HR data.</p>
        </div>
      </div>

      {/* today's summary — on top */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1.5"><CalendarCheck2 className="size-3.5" /> Today's Summary</p>
        {overview.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : isHrView && o ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryStat icon={Users} label="present today" value={o.presentToday} accent="bg-success-bg text-success" />
            <SummaryStat icon={CalendarCheck2} label="on leave" value={o.onLeaveToday} accent="bg-warning-bg text-warning" />
            <SummaryStat icon={ClipboardCheck} label="pending approvals" value={o.pendingLeaveRequests} accent="bg-info-bg text-info" />
            <SummaryStat icon={Cake} label="birthdays today" value={birthdaysToday} accent="bg-primary/10 text-primary dark:text-chart-3" />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(balances.data ?? []).slice(0, 3).map((b) => (
              <SummaryStat key={b.leaveType.id} icon={CalendarPlus} label={`${b.leaveType.name} left`} value={b.available} accent="bg-primary/10 text-primary dark:text-chart-3" />
            ))}
            <SummaryStat icon={Cake} label="birthdays soon" value={birthdaysSoon} accent="bg-warning-bg text-warning" />
          </div>
        )}
      </div>

      {/* quick action cards */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1.5"><LayoutGrid className="size-3.5" /> Quick Actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {actions.map((a, i) => (
            <motion.button
              key={a.label}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              onClick={() => onLaunch(a.prompt)}
              className="group relative overflow-hidden rounded-xl border border-border bg-surface p-4 text-left shadow-card hover:shadow-raised transition-shadow cursor-pointer"
            >
              <div className={cn("inline-flex rounded-lg bg-gradient-to-br p-2.5 text-white", a.accent)}><a.icon className="size-5" /></div>
              <p className="mt-2.5 font-semibold text-text">{a.label}</p>
              <p className="text-xs text-text-muted">{a.sublabel}</p>
              <ArrowRight className="absolute right-3 top-4 size-4 text-text-faint opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </motion.button>
          ))}
        </div>
      </div>

      {/* upcoming birthdays mini */}
      {(celebrations.data?.birthdays.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1.5"><Cake className="size-3.5" /> Celebrations</p>
          <div className="flex flex-wrap gap-2">
            {celebrations.data!.birthdays.slice(0, 6).map((b) => (
              <Badge key={b.id} variant={b.isToday ? "warning" : "default"}>🎂 {b.firstName} {b.lastName} · {b.isToday ? "Today" : formatDate(b.date)}</Badge>
            ))}
            {celebrations.data!.anniversaries.slice(0, 4).map((a) => (
              <Badge key={a.id} variant="success">🎉 {a.firstName} {a.lastName} · {a.years}y</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================= */
export function SomAIPage() {
  const status = useAiStatus();
  const conversations = useConversations();
  const createConvo = useCreateConversation();
  const deleteConvo = useDeleteConversation();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const threadRef = React.useRef<ChatThreadHandle>(null);

  const launch = async (prompt: string) => {
    const convo = await createConvo.mutateAsync();
    setActiveId(convo.id);
    if (prompt.trim().endsWith("for ") || prompt.trim().endsWith("directory for")) {
      setInput(prompt); // search prompt — let user finish typing
      return;
    }
    setTimeout(() => threadRef.current?.send(prompt), 60);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (!activeId) { await launch(text); return; }
    threadRef.current?.send(text);
  };

  if (status.data && !status.data.configured) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-text flex items-center gap-2"><Bot className="size-5 text-primary dark:text-chart-3" /> Sera</h1>
        <Alert variant="warning" title="Sera isn't configured yet">
          An OpenAI API key is required. Add <code>OPENAI_API_KEY</code> to the backend environment and restart.
        </Alert>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", activeId ? "h-[calc(100vh-9rem)]" : "min-h-[calc(100vh-9rem)]")}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-semibold text-text flex items-center gap-2"><Bot className="size-5 text-primary dark:text-chart-3" /> Sera</h1>
          <p className="text-sm text-text-muted">Your HR Command Center.</p>
        </div>
        <div className="flex gap-2">
          {activeId && <Button variant="secondary" size="sm" onClick={() => setActiveId(null)}><Home /> Command Center</Button>}
          <Button size="sm" onClick={() => setActiveId(null)}><Plus /> New</Button>
        </div>
      </div>

      <div className={cn("grid grid-cols-1 lg:grid-cols-[1fr_15rem] gap-4", activeId && "flex-1 min-h-0")}>
        {/* main: command center OR chat */}
        <Card className={cn("rounded-xl flex flex-col overflow-hidden order-2 lg:order-1", activeId && "min-h-0")}>
          {activeId ? (
            <ChatThread ref={threadRef} conversationId={activeId} onTitle={() => conversations.refetch()} />
          ) : (
            <CommandCenter onLaunch={launch} />
          )}
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }} placeholder="Ask Sera or describe what you need…" aria-label="Message Sera" />
              <Button size="icon" onClick={() => void handleSend()} disabled={!input.trim()} aria-label="Send"><SendHorizonal /></Button>
            </div>
          </div>
        </Card>

        {/* conversation rail — right side */}
        <Card className="rounded-xl hidden lg:flex flex-col overflow-hidden order-1 lg:order-2">
          <button onClick={() => setActiveId(null)} className={cn("flex items-center gap-2 border-b border-border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer", !activeId ? "bg-primary/10 text-primary dark:text-chart-3" : "hover:bg-surface-sunken")}>
            <LayoutGrid className="size-4" /> Command Center
          </button>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Recent</p>
            {conversations.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : !conversations.data?.length ? (
              <p className="px-2 text-xs text-text-faint">No conversations yet.</p>
            ) : (
              conversations.data.map((c) => (
                <div key={c.id} className={cn("group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors", activeId === c.id ? "bg-primary/10 text-primary dark:text-chart-3" : "hover:bg-surface-sunken")} onClick={() => setActiveId(c.id)}>
                  <Bot className="size-3.5 shrink-0 opacity-70" />
                  <span className="text-[13px] font-medium truncate flex-1">{c.title ?? "New chat"}</span>
                  <button className="opacity-0 group-hover:opacity-100 text-text-faint hover:text-danger cursor-pointer" aria-label="Delete" onClick={(e) => { e.stopPropagation(); deleteConvo.mutate(c.id); if (activeId === c.id) setActiveId(null); }}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export { FileText };
