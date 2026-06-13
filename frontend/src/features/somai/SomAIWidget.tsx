import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Maximize2, SendHorizonal, X } from "lucide-react";
import { Link } from "react-router-dom";
import { ChatThread, type ChatThreadHandle } from "./ChatThread";
import { useAiStatus, useConversations, useCreateConversation } from "./useSomAI";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Floating Sera copilot, available on every authenticated page. */
export function SomAIWidget() {
  const { can } = usePermissions();
  const status = useAiStatus();
  const [open, setOpen] = React.useState(false);
  const conversations = useConversations();
  const createConvo = useCreateConversation();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const threadRef = React.useRef<ChatThreadHandle>(null);

  React.useEffect(() => {
    if (!open || activeId) return;
    if (conversations.data?.length) setActiveId(conversations.data[0]!.id);
  }, [open, conversations.data, activeId]);

  if (!can("ai:use") || (status.data && !status.data.configured)) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    let id = activeId;
    if (!id) {
      const convo = await createConvo.mutateAsync();
      id = convo.id;
      setActiveId(id);
      setTimeout(() => threadRef.current?.send(text), 50);
      return;
    }
    threadRef.current?.send(text);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 right-5 z-50 flex h-[32rem] w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay"
          >
            <div className="flex items-center justify-between bg-gradient-to-r from-secondary to-primary px-4 py-3 text-white">
              <span className="flex items-center gap-2 font-semibold"><Bot className="size-4" /> Sera</span>
              <span className="flex items-center gap-1">
                <Button asChild variant="ghost" size="icon-sm" className="text-white hover:bg-white/15" aria-label="Open full page">
                  <Link to="/sera" onClick={() => setOpen(false)}><Maximize2 className="size-4" /></Link>
                </Button>
                <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/15" onClick={() => setOpen(false)} aria-label="Close"><X className="size-4" /></Button>
              </span>
            </div>
            <ChatThread ref={threadRef} conversationId={activeId} compact onTitle={() => conversations.refetch()} />
            <div className="border-t border-border p-2.5">
              <div className="flex items-center gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                  placeholder="Ask Sera…"
                  aria-label="Message Sera"
                />
                <Button size="icon" onClick={() => void handleSend()} disabled={!input.trim()} aria-label="Send"><SendHorizonal /></Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-(--chart-2) text-white shadow-overlay cursor-pointer"
        aria-label="Open Sera"
      >
        {open ? <X className="size-6" /> : <Bot className="size-6" />}
      </motion.button>
    </>
  );
}
