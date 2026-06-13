import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const get = <T>(url: string) => api.get<{ data: T }>(url).then((r) => r.data.data);

export interface ExplorerPerson {
  id: string; employeeCode: string; firstName: string; lastName: string; photoUrl: string | null;
  status: string; designation: { title: string } | null; department: { id: string; name: string } | null;
  location: { name: string } | null; directReports?: number;
}

export interface OrgOverview {
  totals: { employees: number; departments: number; managers: number; individualContributors: number; newJoiners: number };
  departments: Array<{ id: string; name: string; code: string; headcount: number; managerCount: number; head: { id: string; firstName: string; lastName: string; photoUrl: string | null; designation: { title: string } | null } | null }>;
}

export interface DepartmentDetail {
  department: { id: string; name: string; code: string };
  head: ExplorerPerson | null;
  headcount: number;
  managers: ExplorerPerson[];
  members: ExplorerPerson[];
  designationBreakdown: Array<{ title: string; count: number }>;
}

export interface ManagerDetail {
  manager: ExplorerPerson & { manager: { id: string; firstName: string; lastName: string; photoUrl: string | null } | null };
  directReports: ExplorerPerson[];
  teamSize: number;
  attendance: { present: number; onLeave: number; notMarked: number; total: number };
  performance: { avgRating: number | null; reviewed: number; total: number };
}

export const useOrgOverview = () => useQuery({ queryKey: ["org-explorer", "overview"], queryFn: () => get<OrgOverview>("/org/explorer/overview") });
export const useDepartmentDetail = (id: string | null) => useQuery({ queryKey: ["org-explorer", "dept", id], queryFn: () => get<DepartmentDetail>(`/org/explorer/department/${id}`), enabled: Boolean(id) });
export const useManagerDetail = (id: string | null) => useQuery({ queryKey: ["org-explorer", "manager", id], queryFn: () => get<ManagerDetail>(`/org/explorer/manager/${id}`), enabled: Boolean(id) });
