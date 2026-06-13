import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

const get = <T>(url: string) => api.get<{ data: T }>(url).then((r) => r.data.data);

export interface Conversation { id: string; title: string | null; updatedAt: string }
export interface ChatMessage { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: string }

export const useAiStatus = () =>
  useQuery({ queryKey: ["ai", "status"], queryFn: () => get<{ configured: boolean }>("/ai/status"), staleTime: 600_000 });

export const useConversations = () =>
  useQuery({ queryKey: ["ai", "conversations"], queryFn: () => get<Conversation[]>("/ai/conversations") });

export const useConversationMessages = (id: string | null) =>
  useQuery({ queryKey: ["ai", "messages", id], queryFn: () => get<ChatMessage[]>(`/ai/conversations/${id}/messages`), enabled: Boolean(id) });

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<{ data: Conversation }>("/ai/conversations")).data.data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] }),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/ai/conversations/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] }),
  });
}

export interface StreamHandlers {
  onToken: (text: string) => void;
  onTool: (name: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * Stream a SomAI reply over SSE. EventSource can't send auth headers on a
 * POST, so we read the fetch body stream and parse SSE frames manually.
 */
export function useStreamChat() {
  const [streaming, setStreaming] = React.useState(false);

  const send = React.useCallback(async (conversationId: string, message: string, handlers: StreamHandlers) => {
    setStreaming(true);
    const token = useAuthStore.getState().accessToken;
    try {
      const res = await fetch(`/api/v1/ai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        credentials: "include",
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        handlers.onError(err?.error?.message ?? "SomAI request failed");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const evLine = frame.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!evLine || !dataLine) continue;
          const event = evLine.slice(6).trim();
          const data = JSON.parse(dataLine.slice(5).trim());
          if (event === "token") handlers.onToken(data.text);
          else if (event === "tool") handlers.onTool(data.name);
          else if (event === "done") handlers.onDone();
          else if (event === "error") handlers.onError(data.message);
        }
      }
    } catch (err) {
      handlers.onError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setStreaming(false);
    }
  }, []);

  return { send, streaming };
}

export const SUGGESTED_PROMPTS = [
  "How many leaves do I have left?",
  "Show my attendance this month",
  "List my payslips",
  "Apply casual leave for tomorrow",
  "Raise an IT ticket — my laptop is slow",
];
