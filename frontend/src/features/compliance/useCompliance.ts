import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export interface Statutory {
  id: string;
  aadhaarNumber: string | null;
  panNumber: string | null;
  uanNumber: string | null;
  pfNumber: string | null;
  esicNumber: string | null;
  nationalId: string | null;
  taxRegime: "OLD" | "NEW";
  pfOptedIn: boolean;
  esiApplicable: boolean;
  verifiedAt: string | null;
}

export interface DirectoryRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  department: string | null;
  designation: string | null;
  statutory: Statutory | null;
  complete: boolean;
  verified: boolean;
}

export interface RegisterRow {
  employeeId: string; employeeCode: string; name: string;
  uan: string | null; esic: string | null; pan: string | null;
  gross: number; pf: number; pt: number; esi: number; tds: number;
}
export interface Registers {
  month: number; year: number; employees: number;
  rows: RegisterRow[];
  totals: { pf: number; pt: number; esi: number; tds: number; gross: number };
}

export interface ComplianceTask {
  id: string;
  type: string;
  title: string;
  authority: string | null;
  period: string;
  dueDate: string;
  status: "PENDING" | "FILED" | "OVERDUE" | "WAIVED";
  amount: string | null;
  filedAt: string | null;
  reference: string | null;
  notes: string | null;
}

export interface ComplianceSummary {
  activeEmployees: number;
  statutoryComplete: number;
  statutoryPending: number;
  verified: number;
  completionPct: number;
  overdueFilings: number;
  filingsDueSoon: number;
  documentsExpiring: number;
}

export interface DocExpiry {
  id: string; name: string; category: string; expiresOn: string; expired: boolean;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
}

export const TASK_TYPES = ["PF_ECR", "PT_RETURN", "ESI_RETURN", "TDS_PAYMENT", "TDS_RETURN", "GRATUITY", "LWF", "SHOPS_ACT", "OTHER"] as const;

export const useMyStatutory = () => useQuery({ queryKey: ["compliance", "me"], queryFn: () => get<Statutory | null>("/compliance/me") });
export const useComplianceSummary = (enabled: boolean) => useQuery({ queryKey: ["compliance", "summary"], queryFn: () => get<ComplianceSummary>("/compliance/summary"), enabled });
export const useDirectory = (filters: { search?: string; filter?: string }) => useQuery({ queryKey: ["compliance", "directory", filters], queryFn: () => get<DirectoryRow[]>("/compliance/directory", filters) });
export const useRegisters = (month: number, year: number) => useQuery({ queryKey: ["compliance", "registers", month, year], queryFn: () => get<Registers>("/compliance/registers", { month, year }) });
export const useComplianceTasks = (status?: string) => useQuery({ queryKey: ["compliance", "tasks", status], queryFn: () => get<ComplianceTask[]>("/compliance/tasks", status ? { status } : undefined) });
export const useDocExpiry = (enabled: boolean) => useQuery({ queryKey: ["compliance", "doc-expiry"], queryFn: () => get<DocExpiry[]>("/compliance/document-expiry"), enabled });

function useComplianceMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const msg = (res as { data?: { message?: string } })?.data?.message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["compliance"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useSaveMyStatutory = () => useComplianceMutation((input: Record<string, unknown>) => api.put("/compliance/me", input));
export const useUpdateEmployeeStatutory = () => useComplianceMutation((input: { id: string } & Record<string, unknown>) => { const { id, ...body } = input; return api.put(`/compliance/employee/${id}`, body); });
export const useCreateTask = () => useComplianceMutation((input: Record<string, unknown>) => api.post("/compliance/tasks", input));
export const useUpdateTask = () => useComplianceMutation((input: { id: string } & Record<string, unknown>) => { const { id, ...body } = input; return api.patch(`/compliance/tasks/${id}`, body); });
export const useGenerateTasks = () => useComplianceMutation((input: { month: number; year: number }) => api.post("/compliance/tasks/generate", input));
