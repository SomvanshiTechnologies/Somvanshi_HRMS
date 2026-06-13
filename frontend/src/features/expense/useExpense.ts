import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export interface ExpenseCategory {
  id: string;
  name: string;
  maxAmount: string | null;
  requiresReceipt: boolean;
}

export interface ExpenseItem {
  id: string;
  date: string;
  amount: string;
  description: string | null;
  receiptUrl: string | null;
  category: { id: string; name: string };
}

export interface ExpenseReport {
  id: string;
  title: string;
  status: "DRAFT" | "SUBMITTED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "REIMBURSED";
  totalAmount: string;
  submittedAt: string | null;
  actedAt: string | null;
  approverRemarks: string | null;
  createdAt: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; photoUrl: string | null };
  items: ExpenseItem[];
  reimbursement: { id: string; amount: string; paidVia: string | null; reference: string | null; paidAt: string | null } | null;
}

export interface ExpenseSummary {
  pendingCount: number;
  pendingAmount: string;
  reimbursedAmount: string;
  byStatus: Record<string, number>;
}

export const EXPENSE_STATUSES = ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "REIMBURSED"] as const;

export const useExpenseCategories = () =>
  useQuery({ queryKey: ["expenses", "categories"], queryFn: () => get<ExpenseCategory[]>("/expenses/categories"), staleTime: 600_000 });

export const useExpenseReports = (filters: { status?: string; scope?: string }) =>
  useQuery({ queryKey: ["expenses", "reports", filters], queryFn: () => get<{ reports: ExpenseReport[]; reviewerView: boolean }>("/expenses", filters) });

export const useExpenseReport = (id: string | null) =>
  useQuery({ queryKey: ["expenses", "report", id], queryFn: () => get<ExpenseReport>(`/expenses/${id}`), enabled: Boolean(id) });

export const useExpenseSummary = (enabled: boolean) =>
  useQuery({ queryKey: ["expenses", "summary"], queryFn: () => get<ExpenseSummary>("/expenses/summary"), enabled });

function useExpenseMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const msg = (res as { data?: { message?: string } })?.data?.message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export interface NewExpenseItem { categoryId: string; date: string; amount: number; description?: string; receiptUrl?: string }

export const useCreateExpense = () => useExpenseMutation((input: { title: string; items: NewExpenseItem[] }) => api.post("/expenses", input));
export const useSubmitExpense = () => useExpenseMutation((id: string) => api.post(`/expenses/${id}/submit`));
export const useDecideExpense = () => useExpenseMutation((input: { id: string; decision: "APPROVED" | "REJECTED"; remarks?: string }) => api.patch(`/expenses/${input.id}/decide`, { decision: input.decision, remarks: input.remarks }));
export const useReimburseExpense = () => useExpenseMutation((input: { id: string; paidVia: string; reference?: string }) => api.post(`/expenses/${input.id}/reimburse`, { paidVia: input.paidVia, reference: input.reference }));
