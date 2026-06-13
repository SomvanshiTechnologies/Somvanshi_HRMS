import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  colorHex: string;
  isPaid: boolean;
  policies?: Array<{ requiresDocument: boolean; noticeDays: number; allowHalfDay: boolean }>;
}

export interface LeaveBalance {
  leaveType: LeaveType;
  year: number;
  entitled: number;
  used: number;
  pending: number;
  carriedOver: number;
  available: number;
}

export interface LeaveStep {
  id: string;
  sequence: number;
  approverType: string;
  roleName: string | null;
  status: string;
  actedAt: string | null;
  remarks: string | null;
}

export interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  startUnit: string;
  endUnit: string;
  days: number;
  reason: string;
  status: string;
  currentStep: number;
  moreInfoNote: string | null;
  createdAt: string;
  leaveType: LeaveType;
  steps: LeaveStep[];
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    department: { name: string } | null;
    designation: { title: string } | null;
  };
}

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export const useLeaveTypes = () =>
  useQuery({ queryKey: ["leave", "types"], queryFn: () => get<LeaveType[]>("/leave/types"), staleTime: 10 * 60_000 });

export const useMyBalances = () =>
  useQuery({ queryKey: ["leave", "balances"], queryFn: () => get<LeaveBalance[]>("/leave/balances/me") });

export const useMyLeaveRequests = () =>
  useQuery({ queryKey: ["leave", "requests", "me"], queryFn: () => get<LeaveRequest[]>("/leave/requests/me") });

function invalidateLeave(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["leave"] });
  void queryClient.invalidateQueries({ queryKey: ["analytics"] });
  void queryClient.invalidateQueries({ queryKey: ["attendance"] });
}

export function useApplyLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post("/leave/requests", input),
    onSuccess: () => {
      toast.success("Leave request submitted.");
      invalidateLeave(queryClient);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useCancelLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/leave/requests/${id}`),
    onSuccess: () => {
      toast.success("Leave request cancelled.");
      invalidateLeave(queryClient);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

// ---- approvals ----

export const usePendingApprovals = (enabled: boolean) =>
  useQuery({
    queryKey: ["leave", "approvals"],
    queryFn: () => get<LeaveRequest[]>("/leave/approvals"),
    enabled,
  });

export function useDecideLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; decision: "approve" | "reject"; remarks?: string }) =>
      api.patch(`/leave/requests/${input.id}/${input.decision}`, { remarks: input.remarks }),
    onSuccess: (_r, vars) => {
      toast.success(vars.decision === "approve" ? "Leave approved." : "Leave rejected.");
      invalidateLeave(queryClient);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useRequestLeaveInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; note: string }) =>
      api.patch(`/leave/requests/${input.id}/request-info`, { note: input.note }),
    onSuccess: () => {
      toast.success("Clarification requested.");
      invalidateLeave(queryClient);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useBulkApprove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { requestIds: string[]; remarks?: string }) =>
      api.post<{ data: Array<{ id: string; ok: boolean; error?: string }> }>("/leave/requests/bulk-approve", input),
    onSuccess: (res) => {
      const results = res.data.data;
      const approved = results.filter((r) => r.ok).length;
      const failed = results.length - approved;
      toast.success(`Approved ${approved} request(s)${failed ? `, ${failed} failed` : ""}.`);
      invalidateLeave(queryClient);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

// ---- calendar & holidays ----

export interface CalendarLeave {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  leaveType: { name: string; code: string; colorHex: string };
  employee: { id: string; firstName: string; lastName: string; photoUrl: string | null; department: { name: string } | null };
}
export interface Holiday {
  id: string;
  name: string;
  date: string;
  isOptional: boolean;
}

export const useLeaveCalendar = (month: number, year: number, scope: "team" | "org") =>
  useQuery({
    queryKey: ["leave", "calendar", month, year, scope],
    queryFn: () => get<{ requests: CalendarLeave[]; holidays: Holiday[] }>("/leave/calendar", { month, year, scope }),
  });

export const useHolidays = (year: number) =>
  useQuery({ queryKey: ["leave", "holidays", year], queryFn: () => get<Holiday[]>("/leave/holidays", { year }) });

export function useAddHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; date: string; isOptional: boolean }) => api.post("/leave/holidays", input),
    onSuccess: () => {
      toast.success("Holiday added.");
      void queryClient.invalidateQueries({ queryKey: ["leave"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useRemoveHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/leave/holidays/${id}`),
    onSuccess: () => {
      toast.success("Holiday removed.");
      void queryClient.invalidateQueries({ queryKey: ["leave"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

// ---- workflow config ----

export interface WorkflowStep {
  type: "MANAGER" | "ROLE";
  role?: string;
}

export const useLeaveWorkflow = (enabled: boolean) =>
  useQuery({
    queryKey: ["leave", "workflow"],
    queryFn: () => get<{ steps: WorkflowStep[] } | null>("/leave/workflow"),
    enabled,
  });

export function useSetLeaveWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (steps: WorkflowStep[]) => api.put("/leave/workflow", { steps }),
    onSuccess: () => {
      toast.success("Approval workflow updated.");
      void queryClient.invalidateQueries({ queryKey: ["leave", "workflow"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
