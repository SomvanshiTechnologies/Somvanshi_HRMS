import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export const useLeaveTrends = (months: number) =>
  useQuery({ queryKey: ["analytics", "leave-trends", months], queryFn: () => get<{ types: string[]; points: Array<Record<string, string | number>> }>("/analytics/leave-trends", { months }) });

export const useHiringFunnel = () =>
  useQuery({ queryKey: ["analytics", "hiring-funnel"], queryFn: () => get<Array<{ stage: string; count: number }>>("/analytics/hiring-funnel") });

export const useAttendanceTrend = (months: number) =>
  useQuery({ queryKey: ["analytics", "attendance-trend", months], queryFn: () => get<Array<{ month: string; present: number; absent: number; onLeave: number; halfDay: number }>>("/analytics/attendance-trend", { months }) });

export const usePayrollTrend = (months: number, enabled: boolean) =>
  useQuery({ queryKey: ["analytics", "payroll-trend", months], queryFn: () => get<Array<{ month: string; gross: number; net: number; deductions: number }>>("/analytics/payroll-trend", { months }), enabled });

export const useHiringTrend = (months: number) =>
  useQuery({ queryKey: ["analytics", "hiring-trend", months], queryFn: () => get<Array<{ month: string; applications: number; offers: number; joined: number }>>("/analytics/hiring-trend", { months }) });

/** Export any analytics series to CSV client-side (no fake data — real rows). */
export function exportSeriesCsv(filename: string, input: readonly object[]): void {
  const rows = input as ReadonlyArray<Record<string, unknown>>;
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
