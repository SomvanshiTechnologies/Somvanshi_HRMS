import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: string;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  employeeCount: number;
  processedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  remarks: string | null;
}

export interface PayslipRow {
  id: string;
  month: number;
  year: number;
  paidDays: string;
  lopDays: string;
  grossEarnings: string;
  totalDeductions: string;
  netPay: string;
  status: string;
  publishedAt: string | null;
  lines?: Array<{ id: string; type: string; label: string; amount: string }>;
  employee?: { id: string; employeeCode: string; firstName: string; lastName: string; photoUrl: string | null; department: { name: string } | null };
}

export interface SalaryEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  department: { name: string } | null;
  designation: { title: string } | null;
  salaries: Array<{ id: string; annualCtc: string; monthlyGross: string; effectiveFrom: string; structure: { name: string } }>;
}

export const useRuns = () => useQuery({ queryKey: ["payroll", "runs"], queryFn: () => get<PayrollRun[]>("/payroll/runs") });
export const useRun = (id: string | null) =>
  useQuery({
    queryKey: ["payroll", "runs", id],
    queryFn: () => get<PayrollRun & { payslips: PayslipRow[] }>(`/payroll/runs/${id}`),
    enabled: Boolean(id),
  });
export const useStructures = () =>
  useQuery({ queryKey: ["payroll", "structures"], queryFn: () => get<Array<{ id: string; name: string; description: string | null }>>("/payroll/structures"), staleTime: 600_000 });
export const useSalaryEmployees = () =>
  useQuery({ queryKey: ["payroll", "employees"], queryFn: () => get<SalaryEmployee[]>("/payroll/employees") });
export const useRevisions = () =>
  useQuery({ queryKey: ["payroll", "revisions"], queryFn: () => get<Array<Record<string, any>>>("/payroll/revisions") });
export const useMyPayslips = () =>
  useQuery({ queryKey: ["payroll", "payslips", "me"], queryFn: () => get<PayslipRow[]>("/payroll/payslips/me") });

export interface PayslipLineItem { label: string; code: string; amount: number }
export interface PayslipDetail {
  id: string;
  period: { month: number; year: number; label: string };
  status: string;
  payment: { status: string; paidAt: string | null; processedAt: string | null; utr: string | null };
  company: { name: string };
  employee: { id: string; name: string; code: string; photoUrl: string | null; designation: string | null; department: string | null; location: string | null; dateOfJoining: string | null; employmentType: string };
  earnings: PayslipLineItem[];
  deductions: PayslipLineItem[];
  totals: { gross: number; deductions: number; net: number };
  ctc: { annual: number; monthly: number } | null;
  bank: { bankName: string; accountLast4: string; ifsc: string | null } | null;
  attendance: { workingDays: number | null; present: number | null; paidDays: number; leaveDays: number | null; lopDays: number; attendancePct: number | null };
  ytd: { gross: number; net: number; tds: number; pf: number };
}

export const usePayslipDetail = (id: string | null) =>
  useQuery({ queryKey: ["payroll", "payslip", id], queryFn: () => get<PayslipDetail>(`/payroll/payslips/${id}`), enabled: Boolean(id) });

export function useEmailPayslip() {
  return useMutation({
    mutationFn: (id: string) => api.post(`/payroll/payslips/${id}/email`),
    onSuccess: (res) => toast.success((res.data as { message?: string }).message ?? "Payslip emailed."),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

/** Indian-format amount in words (e.g. "Forty Six Thousand Eight Hundred"). */
export function amountInWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number): string => (n < 20 ? ones[n]! : `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`);
  const three = (n: number): string => (n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? " " + two(n % 100) : ""}` : two(n));
  let n = Math.floor(num);
  if (n === 0) return "Zero";
  const cr = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const th = Math.floor(n / 1000); n %= 1000;
  return [cr ? `${two(cr)} Crore` : "", lakh ? `${two(lakh)} Lakh` : "", th ? `${two(th)} Thousand` : "", n ? three(n) : ""].filter(Boolean).join(" ");
}

export function downloadPayslipCsv(d: PayslipDetail): void {
  const rows = [
    ["Payslip", d.period.label],
    ["Employee", d.employee.name], ["Employee Code", d.employee.code],
    ["", ""], ["EARNINGS", "Amount"],
    ...d.earnings.map((e) => [e.label, String(e.amount)]),
    ["Gross", String(d.totals.gross)],
    ["", ""], ["DEDUCTIONS", "Amount"],
    ...d.deductions.map((e) => [e.label, String(e.amount)]),
    ["Total Deductions", String(d.totals.deductions)],
    ["", ""], ["NET PAY", String(d.totals.net)],
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = `payslip-${d.period.label.replace(/\s+/g, "-")}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function mutated(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["payroll"] });
  void queryClient.invalidateQueries({ queryKey: ["analytics"] });
}

export function useSetSalary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { employeeId: string; structureId: string; annualCtc: number; reason?: string }) =>
      api.put(`/payroll/employees/${input.employeeId}/salary`, input),
    onSuccess: () => { toast.success("Salary updated."); mutated(queryClient); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useProcessRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { month: number; year: number }) => api.post("/payroll/runs", input),
    onSuccess: () => { toast.success("Payroll processed — review and approve."); mutated(queryClient); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useRunAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: "approve" | "mark-paid" }) =>
      api.patch(`/payroll/runs/${input.id}/${input.action}`),
    onSuccess: (res) => {
      toast.success((res.data as { message?: string }).message ?? "Done.");
      mutated(queryClient);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export async function openPayslipPdf(id: string): Promise<void> {
  const res = await api.get(`/payroll/payslips/${id}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadRegister(runId: string): Promise<void> {
  const res = await api.get(`/payroll/runs/${runId}/register`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "salary-register.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
