import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

export interface AttendanceRecord {
  id: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workMinutes: number;
  breakMinutes: number;
  status: string;
  isLate: boolean;
  isEarlyOut: boolean;
  breaks: Array<{ id: string; startAt: string; endAt: string | null }>;
}

export interface TodayState {
  date: string;
  shift: { name: string; startTime: string; endTime: string } | null;
  record: AttendanceRecord | null;
  activeBreak: { id: string; startAt: string } | null;
  onLeaveToday: boolean;
}

export interface MonthDay {
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workMinutes: number;
  isLate: boolean;
}

export interface MonthSummary {
  present: number;
  absent: number;
  halfDay: number;
  onLeave: number;
  wfh: number;
  late: number;
  workMinutes: number;
  workingDays: number;
}

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export const useToday = () =>
  useQuery({ queryKey: ["attendance", "today"], queryFn: () => get<TodayState>("/attendance/today"), refetchInterval: 60_000 });

export const useMyMonth = (month: number, year: number) =>
  useQuery({
    queryKey: ["attendance", "me", month, year],
    queryFn: () => get<{ days: MonthDay[]; summary: MonthSummary }>("/attendance/me", { month, year }),
  });

function usePunch(path: string, getsLocation = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      let coords: { latitude?: number; longitude?: number } = {};
      if (getsLocation && "geolocation" in navigator) {
        coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            () => resolve({}),
            { timeout: 3000 }
          );
        });
      }
      return api.post(`/attendance/${path}`, { source: coords.latitude ? "GPS" : "WEB", ...coords });
    },
    onSuccess: (res) => {
      const msg = (res.data as { message?: string }).message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useCheckIn = () => usePunch("check-in", true);
export const useCheckOut = () => usePunch("check-out", true);
export const useStartBreak = () => usePunch("breaks/start");
export const useEndBreak = () => usePunch("breaks/end");

export const useMyCorrections = () =>
  useQuery({ queryKey: ["attendance", "corrections", "me"], queryFn: () => get<Array<Record<string, any>>>("/attendance/corrections/me") });

export function useRequestCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: string; requestedCheckIn?: string; requestedCheckOut?: string; reason: string }) =>
      api.post("/attendance/corrections", input),
    onSuccess: () => {
      toast.success("Correction submitted for approval.");
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

// ---- team / org ----

export interface DayRow {
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    department: { name: string } | null;
    designation: { title: string } | null;
  };
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workMinutes: number;
  isLate: boolean;
}

export const useDayView = (date: string, enabled: boolean) =>
  useQuery({
    queryKey: ["attendance", "day", date],
    queryFn: () =>
      get<{ date: string; rows: DayRow[]; counts: { present: number; absent: number; late: number; onLeave: number; halfDay: number; wfh: number } }>(
        "/attendance/day",
        { date }
      ),
    enabled,
  });

export const usePendingCorrections = (enabled: boolean) =>
  useQuery({
    queryKey: ["attendance", "corrections", "pending"],
    queryFn: () => get<Array<Record<string, any>>>("/attendance/corrections/pending"),
    enabled,
  });

export function useDecideCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; decision: "approve" | "reject"; remarks?: string }) =>
      api.patch(`/attendance/corrections/${input.id}/${input.decision}`, { remarks: input.remarks }),
    onSuccess: () => {
      toast.success("Done.");
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export interface ReportRow {
  employee: { id: string; employeeCode: string; name: string; department: string };
  monthly: Record<string, { present: number; absent: number; halfDay: number; onLeave: number; late: number; workMinutes: number; workingDays: number }>;
  totals: { present: number; absent: number; halfDay: number; onLeave: number; late: number; workMinutes: number; workingDays: number };
}

export interface AttendanceReport {
  year: number;
  months: number[];
  rows: ReportRow[];
}

export const useAttendanceReport = (year: number, month?: number, departmentId?: string) =>
  useQuery({
    queryKey: ["attendance", "report", year, month, departmentId],
    queryFn: () =>
      get<AttendanceReport>("/attendance/report", { year, ...(month ? { month } : {}), ...(departmentId ? { departmentId } : {}) }),
  });

export async function downloadAttendanceCsv(year: number, month?: number, departmentId?: string): Promise<void> {
  const params: Record<string, unknown> = { year };
  if (month) params.month = month;
  if (departmentId) params.departmentId = departmentId;
  const res = await api.get("/attendance/export", { params, responseType: "blob" });
  const tag = month ? `${year}-${String(month).padStart(2, "0")}` : `${year}`;
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `somhr-attendance-${tag}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function useDeleteAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { employeeId: string; date: string }) =>
      api.delete(`/attendance/record/${input.employeeId}/${input.date}`),
    onSuccess: () => {
      toast.success("Attendance record deleted.");
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

// ---- admin manual marking ----

export interface ManualMarkInput {
  employeeId: string;
  date: string; // yyyy-mm-dd
  status: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  remarks?: string;
}

export function useManualMark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualMarkInput) => api.post("/attendance/manual", input),
    onSuccess: () => {
      toast.success("Attendance saved.");
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useBulkMark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { employeeIds: string[]; date: string; status: string; remarks?: string }) =>
      api.post("/attendance/manual/bulk", input),
    onSuccess: (res) => {
      const count = (res.data as { data?: { count?: number } }).data?.count ?? 0;
      toast.success(`Updated ${count} record${count === 1 ? "" : "s"}.`);
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

// ---- shifts ----

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  isNightShift: boolean;
  _count?: { assignments: number };
}

export const useShifts = () =>
  useQuery({ queryKey: ["attendance", "shifts"], queryFn: () => get<Shift[]>("/attendance/shifts") });

export function useCreateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post("/attendance/shifts", input),
    onSuccess: () => {
      toast.success("Shift created.");
      void queryClient.invalidateQueries({ queryKey: ["attendance", "shifts"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useAssignShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { employeeId: string; shiftId: string; effectiveFrom?: string }) =>
      api.post("/attendance/shifts/assign", input),
    onSuccess: () => {
      toast.success("Shift assigned.");
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
