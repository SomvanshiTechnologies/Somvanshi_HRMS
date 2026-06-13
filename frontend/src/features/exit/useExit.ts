import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export interface ClearanceItem {
  id: string;
  department: string;
  item: string;
  status: "PENDING" | "CLEARED" | "BLOCKED";
  remarks: string | null;
  clearedAt: string | null;
}

export interface FnfBreakdown {
  monthlyGross: number;
  earnings: Array<{ label: string; amount: number }>;
  deductions: Array<{ label: string; amount: number }>;
}

export interface Fnf {
  id: string;
  earnings: string;
  deductions: string;
  netPayable: string;
  breakdown: FnfBreakdown | null;
  status: "PENDING" | "CALCULATED" | "APPROVED" | "SETTLED";
  settledAt: string | null;
  relievingLetterUrl: string | null;
  experienceLetterUrl: string | null;
}

export interface ExitInterview {
  id: string;
  scheduledAt: string | null;
  conductedAt: string | null;
  sentiment: string | null;
  summary: string | null;
}

export interface Resignation {
  id: string;
  reason: string;
  noticePeriodDays: number;
  lastWorkingDay: string;
  submittedAt: string;
  status: "SUBMITTED" | "ACCEPTED" | "RETRACTED" | "IN_NOTICE" | "EXITED";
  acceptedAt: string | null;
  remarks: string | null;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; photoUrl: string | null; department: { name: string } | null; designation: { title: string } | null };
  clearanceItems: ClearanceItem[];
  exitInterview: ExitInterview | null;
  fnf: Fnf | null;
}

export const RESIGNATION_STATUSES = ["SUBMITTED", "ACCEPTED", "IN_NOTICE", "EXITED", "RETRACTED"] as const;

export const useResignations = (filters: { status?: string; scope?: string }) =>
  useQuery({ queryKey: ["exit", "list", filters], queryFn: () => get<{ resignations: Resignation[]; reviewerView: boolean }>("/exit", filters) });

export const useResignation = (id: string | null) =>
  useQuery({ queryKey: ["exit", "one", id], queryFn: () => get<Resignation>(`/exit/${id}`), enabled: Boolean(id) });

export const useExitSummary = (enabled: boolean) =>
  useQuery({ queryKey: ["exit", "summary"], queryFn: () => get<{ active: number; pendingFnf: number; byStatus: Record<string, number> }>("/exit/summary"), enabled });

function useExitMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const msg = (res as { data?: { message?: string } })?.data?.message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["exit"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useSubmitResignation = () => useExitMutation((input: { reason: string; noticePeriodDays: number; lastWorkingDay: string }) => api.post("/exit", input));
export const useRetractResignation = () => useExitMutation((id: string) => api.post(`/exit/${id}/retract`));
export const useAcceptResignation = () => useExitMutation((input: { id: string; lastWorkingDay?: string; remarks?: string }) => api.patch(`/exit/${input.id}/accept`, { lastWorkingDay: input.lastWorkingDay, remarks: input.remarks }));
export const useUpdateClearance = () => useExitMutation((input: { id: string; itemId: string; status: string; remarks?: string }) => api.patch(`/exit/${input.id}/clearance/${input.itemId}`, { status: input.status, remarks: input.remarks }));
export const useSaveInterview = () => useExitMutation((input: { id: string; conductedAt?: string; sentiment?: string; summary?: string }) => api.post(`/exit/${input.id}/interview`, { conductedAt: input.conductedAt, sentiment: input.sentiment, summary: input.summary }));
export const useCalcFnf = () => useExitMutation((input: { id: string; pendingSalaryDays: number; noticeRecoveryDays: number; otherEarnings: number; otherDeductions: number }) => api.post(`/exit/${input.id}/fnf/calculate`, input));
export const useDecideFnf = () => useExitMutation((input: { id: string; action: "APPROVE" | "SETTLE"; relievingLetterUrl?: string; experienceLetterUrl?: string }) => api.patch(`/exit/${input.id}/fnf`, { action: input.action, relievingLetterUrl: input.relievingLetterUrl, experienceLetterUrl: input.experienceLetterUrl }));
