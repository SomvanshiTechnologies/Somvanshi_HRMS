import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export interface Cycle {
  id: string; name: string; startDate: string; endDate: string;
  status: "DRAFT" | "ACTIVE" | "REVIEW" | "CALIBRATION" | "CLOSED";
  _count?: { goals: number; objectives: number; managerReviews: number; selfAssessments: number };
}
export interface Kpi { id: string; name: string; unit: string | null; targetValue: number; actualValue: number }
export interface Goal {
  id: string; cycleId: string; employeeId: string; title: string; description: string | null;
  weight: number; metric: string | null; targetValue: number | null; currentValue: number;
  status: string; dueDate: string | null; kpis: Kpi[];
}
export interface KeyResult { id: string; title: string; metric: string | null; startValue: number; targetValue: number; currentValue: number; status: string }
export interface Objective { id: string; title: string; description: string | null; status: string; progress: number; keyResults: KeyResult[] }
export interface SelfAssessment { id: string; responses: Record<string, unknown>; overallComment: string | null; rating: number | null; status: string; submittedAt: string | null }
export interface Person { id: string; employeeCode: string; firstName: string; lastName: string; photoUrl: string | null; designation: { title: string } | null; department: { name: string } | null }
export interface ManagerReview { id: string; cycleId: string; employeeId: string; rating: number | null; promotionRecommended: boolean; comments: string | null; status: string; submittedAt: string | null; acknowledgedAt: string | null; reviewer?: Person; employee?: Person; cycle?: { name: string } }
export interface TeamReviewRow { employee: Person; review: ManagerReview | null; self: { status: string; rating: number | null } | null }
export interface PerfDashboard {
  reviewsSubmitted: number; reviewsTotal: number; selfSubmitted: number; avgRating: number | null;
  ratingDistribution: Record<string, number>; goalsTotal: number; goalsCompleted: number;
  goalCompletionPct: number; avgObjectiveProgress: number; promotionCandidates: number; feedback360Count: number;
}

export const GOAL_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "ON_TRACK", "AT_RISK", "COMPLETED", "CANCELLED"];

export const useCycles = () => useQuery({ queryKey: ["perf", "cycles"], queryFn: () => get<Cycle[]>("/performance/cycles") });
export const useGoals = (cycleId?: string, employeeId?: string) => useQuery({ queryKey: ["perf", "goals", cycleId, employeeId], queryFn: () => get<Goal[]>("/performance/goals", { cycleId, employeeId }), enabled: Boolean(cycleId) });
export const useObjectives = (cycleId?: string, employeeId?: string) => useQuery({ queryKey: ["perf", "objectives", cycleId, employeeId], queryFn: () => get<Objective[]>("/performance/objectives", { cycleId, employeeId }), enabled: Boolean(cycleId) });
export const useSelfAssessment = (cycleId?: string) => useQuery({ queryKey: ["perf", "self", cycleId], queryFn: () => get<SelfAssessment | null>("/performance/self-assessment", { cycleId }), enabled: Boolean(cycleId) });
export const useTeamReviews = (cycleId?: string) => useQuery({ queryKey: ["perf", "team", cycleId], queryFn: () => get<TeamReviewRow[]>("/performance/reviews/team", { cycleId }), enabled: Boolean(cycleId) });
export const useMyReviews = (cycleId?: string) => useQuery({ queryKey: ["perf", "myReviews", cycleId], queryFn: () => get<ManagerReview[]>("/performance/reviews/me", { cycleId }) });
export const usePromotions = (cycleId?: string) => useQuery({ queryKey: ["perf", "promotions", cycleId], queryFn: () => get<ManagerReview[]>("/performance/promotions", { cycleId }), enabled: Boolean(cycleId) });
export const usePerfDashboard = (cycleId?: string) => useQuery({ queryKey: ["perf", "dashboard", cycleId], queryFn: () => get<PerfDashboard>("/performance/dashboard", { cycleId }), enabled: Boolean(cycleId) });
export const useTopPerformers = (cycleId?: string) => useQuery({ queryKey: ["perf", "top", cycleId], queryFn: () => get<Array<{ employee: Person; rating: number; promotionRecommended: boolean }>>("/performance/top-performers", { cycleId }), enabled: Boolean(cycleId) });

function useM<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const msg = (res as { data?: { message?: string } })?.data?.message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["perf"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useCreateCycle = () => useM((i: { name: string; startDate: string; endDate: string }) => api.post("/performance/cycles", i));
export const useUpdateCycle = () => useM((i: { id: string; status: string }) => api.patch(`/performance/cycles/${i.id}`, { status: i.status }));
export const useCreateGoal = () => useM((i: Record<string, unknown>) => api.post("/performance/goals", i));
export const useUpdateGoal = () => useM((i: { id: string } & Record<string, unknown>) => { const { id, ...b } = i; return api.patch(`/performance/goals/${id}`, b); });
export const useDeleteGoal = () => useM((id: string) => api.delete(`/performance/goals/${id}`));
export const useAddKpi = () => useM((i: { goalId: string } & Record<string, unknown>) => { const { goalId, ...b } = i; return api.post(`/performance/goals/${goalId}/kpis`, b); });
export const useUpdateKpi = () => useM((i: { id: string } & Record<string, unknown>) => { const { id, ...b } = i; return api.patch(`/performance/kpis/${id}`, b); });
export const useCreateObjective = () => useM((i: Record<string, unknown>) => api.post("/performance/objectives", i));
export const useDeleteObjective = () => useM((id: string) => api.delete(`/performance/objectives/${id}`));
export const useAddKeyResult = () => useM((i: { objectiveId: string } & Record<string, unknown>) => { const { objectiveId, ...b } = i; return api.post(`/performance/objectives/${objectiveId}/key-results`, b); });
export const useUpdateKeyResult = () => useM((i: { id: string } & Record<string, unknown>) => { const { id, ...b } = i; return api.patch(`/performance/key-results/${id}`, b); });
export const useSaveSelf = () => useM((i: Record<string, unknown>) => api.put("/performance/self-assessment", i));
export const useSaveReview = () => useM((i: Record<string, unknown>) => api.put("/performance/reviews", i));
export const useAcknowledgeReview = () => useM((id: string) => api.post(`/performance/reviews/${id}/acknowledge`));
export const useGiveFeedback = () => useM((i: Record<string, unknown>) => api.post("/performance/feedback", i));
