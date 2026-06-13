import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type ApiList } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export interface Notification {
  id: string;
  type: "INFO" | "SUCCESS" | "WARNING" | "ALERT" | "APPROVAL" | "SYSTEM";
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export function useNotifications() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<ApiList<Notification>>("/notifications", { params: { limit: 15 } })).data,
  });

  const unread = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => (await api.get<{ data: { count: number } }>("/notifications/unread-count")).data.data.count,
    refetchInterval: 60_000,
  });

  // realtime push
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (n: Notification) => {
      toast(n.title, { description: n.body ?? undefined });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    socket.on("notification:new", handler);
    return () => {
      socket.off("notification:new", handler);
    };
  }, [queryClient]);

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return { list, unreadCount: unread.data ?? 0, markRead, markAllRead };
}
