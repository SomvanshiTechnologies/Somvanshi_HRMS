import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Overview {
  totalEmployees: number;
  activeEmployees: number;
  newJoinersThisMonth: number;
  attritionRate: number;
  payrollCostLastMonth: number;
  openPositions: number;
  attendancePctToday: number;
  presentToday: number;
  onLeaveToday: number;
  pendingLeaveRequests: number;
  leaveUtilizationPct: number;
}

export interface HeadcountPoint {
  month: string;
  headcount: number;
  joiners: number;
  exits: number;
}
export interface AttritionPoint {
  month: string;
  exits: number;
  attritionPct: number;
}
export interface DeptAnalytics {
  id: string;
  name: string;
  head: string | null;
  headcount: number;
  newThisMonth: number;
  fullTime: number;
  interns: number;
}

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export const useOverview = () =>
  useQuery({ queryKey: ["analytics", "overview"], queryFn: () => get<Overview>("/analytics/overview") });

export const useHeadcountTrend = (months = 12) =>
  useQuery({
    queryKey: ["analytics", "headcount", months],
    queryFn: () => get<HeadcountPoint[]>("/analytics/headcount-trend", { months }),
  });

export const useAttritionTrend = (months = 12) =>
  useQuery({
    queryKey: ["analytics", "attrition", months],
    queryFn: () => get<AttritionPoint[]>("/analytics/attrition-trend", { months }),
  });

export const useDepartmentAnalytics = () =>
  useQuery({ queryKey: ["analytics", "department"], queryFn: () => get<DeptAnalytics[]>("/analytics/department") });

export interface CelebrationPerson {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  department: string | null;
  designation: string | null;
  date: string;
  isToday: boolean;
}
export interface Celebrations {
  birthdays: CelebrationPerson[];
  anniversaries: Array<CelebrationPerson & { years: number; isMilestone: boolean }>;
}

export const useCelebrations = () =>
  useQuery({
    queryKey: ["analytics", "celebrations"],
    queryFn: () => get<Celebrations>("/analytics/celebrations"),
    staleTime: 10 * 60_000,
  });

export interface Holiday {
  id: string;
  name: string;
  date: string;
  isOptional: boolean;
}

export const useHolidays = (year = new Date().getFullYear()) =>
  useQuery({
    queryKey: ["leave", "holidays", year],
    queryFn: () => get<Holiday[]>("/leave/holidays", { year }),
    staleTime: 10 * 60_000,
  });
