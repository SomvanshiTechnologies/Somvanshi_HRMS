import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export interface Person {
  id: string; employeeCode: string; firstName: string; lastName: string;
  photoUrl: string | null; designation: { title: string } | null;
}

export interface Recognition {
  id: string;
  badge: string;
  message: string;
  isPublic: boolean;
  createdAt: string;
  from: Person;
  to: Person;
  cheerCount: number;
  cheered: boolean;
}

export interface NewJoiner {
  id: string; employeeCode: string; firstName: string; lastName: string;
  photoUrl: string | null; dateOfJoining: string;
  department: { name: string } | null; designation: { title: string } | null;
}

export const RECOGNITION_BADGES: Record<string, { label: string; emoji: string }> = {
  KUDOS: { label: "Kudos", emoji: "👏" },
  TEAM_PLAYER: { label: "Team Player", emoji: "🤝" },
  INNOVATION: { label: "Innovation", emoji: "💡" },
  LEADERSHIP: { label: "Leadership", emoji: "🌟" },
  CUSTOMER_FIRST: { label: "Customer First", emoji: "💙" },
  ABOVE_AND_BEYOND: { label: "Above & Beyond", emoji: "🚀" },
  MILESTONE: { label: "Milestone", emoji: "🏆" },
  WELCOME: { label: "Welcome", emoji: "🎊" },
};

export const useRecognitions = (scope: "feed" | "received" | "given", badge?: string) =>
  useQuery({ queryKey: ["engagement", "recognition", scope, badge], queryFn: () => get<Recognition[]>("/engagement/recognition", { scope, badge }) });

export const useLeaderboard = () =>
  useQuery({ queryKey: ["engagement", "leaderboard"], queryFn: () => get<Array<{ employee: Person; count: number }>>("/engagement/recognition/leaderboard"), staleTime: 300_000 });

export const useNewJoiners = (days = 30) =>
  useQuery({ queryKey: ["engagement", "new-joiners", days], queryFn: () => get<NewJoiner[]>("/engagement/new-joiners", { days }), staleTime: 600_000 });

function useEngagementMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const msg = (res as { data?: { message?: string } })?.data?.message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["engagement"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useGiveRecognition = () => useEngagementMutation((input: { toEmployeeId: string; badge: string; message: string; isPublic: boolean }) => api.post("/engagement/recognition", input));
export const useDeleteRecognition = () => useEngagementMutation((id: string) => api.delete(`/engagement/recognition/${id}`));

// optimistic-ish cheer toggle
export function useCheer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/engagement/recognition/${id}/cheer`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["engagement", "recognition"] }),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
