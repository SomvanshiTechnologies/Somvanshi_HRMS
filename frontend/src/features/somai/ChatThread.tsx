import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SUGGESTED_PROMPTS, useConversationMessages, useStreamChat, type ChatMessage,
} from "./useSomAI";
import { Skeleton } from "@/components/ui/skeleton";

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-somai text-sm leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:my-2 [&_th]:text-left [&_th]:border-b [&_th]:border-border [&_th]:py-1 [&_th]:px-2 [&_td]:py-1 [&_td]:px-2 [&_td]:border-b [&_td]:border-border/60 [&_code]:rounded [&_code]:bg-surface-sunken [&_code]:px-1 [&_a]:text-primary [&_a]:underline dark:[&_a]:text-chart-3 [&_strong]:font-semibold">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function SeraAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const s = size === "md" ? "size-10" : "size-7";
  const icon = size === "md" ? "text-base" : "text-xs";
  return (
    <div className={cn("shrink-0 flex items-center justify-center rounded-lg bg-gradient-to-br from-[#0d1117] to-[#1c2333] text-white font-bold", s)}>
      <span className={icon}>S</span>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="shrink-0 flex items-center justify-center size-7 rounded-lg bg-[#e8eaed] text-[#5f6368] font-semibold text-xs">
      U
    </div>
  );
}

function Bubble({ role, children }: { role: "USER" | "ASSISTANT"; children: React.ReactNode }) {
  const isUser = role === "USER";
  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      {isUser ? <UserAvatar /> : <SeraAvatar />}
      <div className={cn(
        "max-w-[80%] rounded-2xl px-4 py-3",
        isUser ? "bg-[#0d1117] text-white" : "bg-surface-sunken border border-border text-text"
      )}>
        {children}
      </div>
    </div>
  );
}

export interface ChatThreadHandle {
  send: (text: string) => void;
}

/** Reusable chat thread: history + live streaming. Driven by parent input. */
export const ChatThread = React.forwardRef<ChatThreadHandle, { conversationId: string | null; compact?: boolean; onTitle?: () => void }>(
  ({ conversationId, compact, onTitle }, ref) => {
    const history = useConversationMessages(conversationId);
    const { send: stream, streaming } = useStreamChat();
    const [live, setLive] = React.useState<{ user: string; assistant: string; tool: string | null } | null>(null);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const scrollToBottom = () => requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));

    React.useEffect(() => { scrollToBottom(); }, [history.data, live]);

    const send = React.useCallback((text: string) => {
      if (!conversationId || streaming) return;
      setLive({ user: text, assistant: "", tool: null });
      void stream(conversationId, text, {
        onToken: (t) => setLive((p) => (p ? { ...p, assistant: p.assistant + t, tool: null } : p)),
        onTool: (name) => setLive((p) => (p ? { ...p, tool: name } : p)),
        onDone: () => { setLive(null); void history.refetch(); onTitle?.(); },
        onError: (m) => setLive((p) => (p ? { ...p, assistant: p.assistant + `\n\n_${m}_`, tool: null } : p)),
      });
    }, [conversationId, streaming, stream, history, onTitle]);

    React.useImperativeHandle(ref, () => ({ send }), [send]);

    const messages: ChatMessage[] = history.data ?? [];
    const empty = messages.length === 0 && !live;

    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {history.isLoading && conversationId ? (
          <Skeleton className="h-20 w-2/3" />
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center text-center gap-4 py-8">
            <SeraAvatar size="md" />
            <div>
              <p className="text-base font-semibold text-text">Sera</p>
              <p className="text-sm text-text-muted max-w-xs mt-1">Your HR assistant — ask about leave, attendance, payslips, policies, or raise a ticket.</p>
            </div>
            <div className={cn("flex flex-wrap justify-center gap-2 mt-2", compact && "px-2")}>
              {SUGGESTED_PROMPTS.slice(0, compact ? 3 : 5).map((p) => (
                <button key={p} onClick={() => send(p)} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-muted hover:border-[#0d1117] hover:text-text transition-colors cursor-pointer">
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role}>
                {m.role === "ASSISTANT" ? <Markdown text={m.content} /> : <p className="text-sm whitespace-pre-wrap">{m.content}</p>}
              </Bubble>
            ))}
            {live && (
              <>
                <Bubble role="USER"><p className="text-sm whitespace-pre-wrap">{live.user}</p></Bubble>
                <Bubble role="ASSISTANT">
                  {live.tool && (
                    <p className="flex items-center gap-1.5 text-xs text-text-muted mb-1.5">
                      <Wrench className="size-3.5 animate-pulse" /> Using {live.tool.replace(/_/g, " ")}...
                    </p>
                  )}
                  {live.assistant ? <Markdown text={live.assistant} /> : !live.tool && (
                    <span className="inline-flex gap-1 py-1">
                      <span className="size-1.5 rounded-full bg-text-faint animate-bounce" />
                      <span className="size-1.5 rounded-full bg-text-faint animate-bounce [animation-delay:0.15s]" />
                      <span className="size-1.5 rounded-full bg-text-faint animate-bounce [animation-delay:0.3s]" />
                    </span>
                  )}
                </Bubble>
              </>
            )}
          </>
        )}
      </div>
    );
  }
);
ChatThread.displayName = "ChatThread";
