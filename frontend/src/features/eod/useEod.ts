import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export interface EodReport {
  id: string;
  date: string;
  project: string | null;
  tasksCompleted: string;
  workInProgress: string | null;
  blockers: string | null;
  tomorrowPlan: string | null;
  hoursWorked: number;
  comments: string | null;
  attachments: Array<{ name: string; url: string }> | null;
  status: "DRAFT" | "SUBMITTED" | "REVIEWED";
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}
export interface Person { id: string; employeeCode: string; firstName: string; lastName: string; photoUrl: string | null; designation: { title: string } | null }
export interface TeamRow { employee: Person; report: EodReport | null; status: string }

export const useMyEod = (from?: string, to?: string) =>
  useQuery({ queryKey: ["eod", "me", from, to], queryFn: () => get<EodReport[]>("/eod/me", { from, to }) });
export const useEodByDate = (date: string) =>
  useQuery({ queryKey: ["eod", "by-date", date], queryFn: () => get<EodReport | null>("/eod/me/by-date", { date }), enabled: Boolean(date) });
export const useEodSummary = (period: "week" | "month", date?: string) =>
  useQuery({ queryKey: ["eod", "summary", period, date], queryFn: () => get<{ reports: number; submitted: number; byProject: Array<{ project: string; count: number }>; range: { from: string; to: string } }>("/eod/summary", { period, date }) });
export const useTeamEod = (date: string, enabled: boolean) =>
  useQuery({ queryKey: ["eod", "team", date], queryFn: () => get<{ date: string; rows: TeamRow[] }>("/eod/team", { date }), enabled });
export const useEodDashboard = (enabled: boolean) =>
  useQuery({ queryKey: ["eod", "dashboard"], queryFn: () => get<{ team: number; submittedToday: number; pendingReview: number; missedToday: number; reportsThisWeek: number }>("/eod/dashboard"), enabled });
export const useProjectAnalytics = (from: string, to: string, enabled: boolean) =>
  useQuery({ queryKey: ["eod", "projects", from, to], queryFn: () => get<{ projects: Array<{ project: string; hours: number; reports: number; contributors: number }> }>("/eod/analytics/projects", { from, to }), enabled });

function useM<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const msg = (res as { data?: { message?: string } })?.data?.message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["eod"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useSaveEod = () => useM((input: Record<string, unknown>) => api.put("/eod", input));
export const useDeleteEod = () => useM((id: string) => api.delete(`/eod/${id}`));
export const useReviewEod = () => useM((input: { id: string; reviewNote?: string }) => api.patch(`/eod/${input.id}/review`, { reviewNote: input.reviewNote }));
