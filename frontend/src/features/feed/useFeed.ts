import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export interface Author { id: string; employeeCode: string; firstName: string; lastName: string; photoUrl: string | null; designation: { title: string } | null }
export interface FeedComment { id: string; body: string; createdAt: string; authorEmployeeId: string; author: Author }
export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: "GENERAL" | "POLICY" | "EVENT" | "CELEBRATION" | "ACHIEVEMENT" | "URGENT";
  isPinned: boolean;
  publishedAt: string;
  expiresAt: string | null;
  author: Author;
  reactionCount: number;
  reacted: boolean;
  commentCount: number;
  comments?: FeedComment[];
}

export const ANNOUNCEMENT_CATEGORIES: Record<string, { label: string; emoji: string; variant: string }> = {
  GENERAL: { label: "General", emoji: "📢", variant: "default" },
  POLICY: { label: "Policy", emoji: "📋", variant: "info" },
  EVENT: { label: "Event", emoji: "📅", variant: "default" },
  CELEBRATION: { label: "Celebration", emoji: "🎉", variant: "success" },
  ACHIEVEMENT: { label: "Achievement", emoji: "🏆", variant: "warning" },
  URGENT: { label: "Urgent", emoji: "🚨", variant: "danger" },
};

export const useFeed = (category?: string) =>
  useQuery({ queryKey: ["feed", category], queryFn: () => get<Announcement[]>("/announcements", category ? { category } : undefined) });

export const useAnnouncement = (id: string | null) =>
  useQuery({ queryKey: ["feed", "one", id], queryFn: () => get<Announcement>(`/announcements/${id}`), enabled: Boolean(id) });

function useM<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const msg = (res as { data?: { message?: string } })?.data?.message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useCreateAnnouncement = () => useM((i: Record<string, unknown>) => api.post("/announcements", i));
export const useUpdateAnnouncement = () => useM((i: { id: string } & Record<string, unknown>) => { const { id, ...b } = i; return api.patch(`/announcements/${id}`, b); });
export const useDeleteAnnouncement = () => useM((id: string) => api.delete(`/announcements/${id}`));
export const useReact = () => useM((id: string) => api.post(`/announcements/${id}/react`, { emoji: "👍" }));
export const useAddComment = () => useM((i: { id: string; body: string }) => api.post(`/announcements/${i.id}/comments`, { body: i.body }));
export const useDeleteComment = () => useM((i: { id: string; cid: string }) => api.delete(`/announcements/${i.id}/comments/${i.cid}`));
