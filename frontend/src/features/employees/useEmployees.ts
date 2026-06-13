import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage, type ApiList } from "@/lib/api";

export interface EmployeeRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  status: string;
  employmentType: string;
  dateOfJoining: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; title: string } | null;
  location: { id: string; name: string } | null;
  manager: { id: string; firstName: string; lastName: string } | null;
}

export interface EmployeeFilters {
  page: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
  status?: string;
  departmentId?: string;
  designationId?: string;
  locationId?: string;
  employmentType?: string;
}

export function useEmployees(filters: EmployeeFilters) {
  return useQuery({
    queryKey: ["employees", filters],
    queryFn: async () => (await api.get<ApiList<EmployeeRow>>("/employees", { params: filters })).data,
    placeholderData: (prev) => prev,
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: ["employees", id],
    queryFn: async () => (await api.get<{ data: Record<string, any> }>(`/employees/${id}`)).data.data,
    enabled: Boolean(id),
  });
}

export function useEmployeeTimeline(id: string | undefined) {
  return useQuery({
    queryKey: ["employees", id, "timeline"],
    queryFn: async () =>
      (await api.get<{ data: Array<Record<string, any>> }>(`/employees/${id}/timeline`)).data.data,
    enabled: Boolean(id),
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) =>
      (await api.post<{ data: { id: string } }>("/employees", input)).data.data,
    onSuccess: () => {
      toast.success("Employee created. Welcome email sent if a login was provisioned.");
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useUpdateEmployee(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) =>
      (await api.patch(`/employees/${id}`, input)).data,
    onSuccess: () => {
      toast.success("Employee updated.");
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useLifecycleTransition(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { status: string; remarks?: string }) =>
      (await api.post(`/employees/${id}/lifecycle`, input)).data,
    onSuccess: () => {
      toast.success("Lifecycle updated.");
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    onSuccess: () => {
      toast.success("Employee removed.");
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

// ---- org reference data (drives every dropdown dynamically) ----

export interface Department { id: string; name: string; code: string }
export interface Designation { id: string; title: string; level: number }
export interface OrgLocation { id: string; name: string; city: string | null }

export const useDepartments = () =>
  useQuery({
    queryKey: ["org", "departments"],
    queryFn: async () => (await api.get<{ data: Department[] }>("/org/departments")).data.data,
    staleTime: 5 * 60_000,
  });

export const useDesignations = () =>
  useQuery({
    queryKey: ["org", "designations"],
    queryFn: async () => (await api.get<{ data: Designation[] }>("/org/designations")).data.data,
    staleTime: 5 * 60_000,
  });

export const useLocations = () =>
  useQuery({
    queryKey: ["org", "locations"],
    queryFn: async () => (await api.get<{ data: OrgLocation[] }>("/org/locations")).data.data,
    staleTime: 5 * 60_000,
  });

export async function downloadEmployeesCsv(filters: Omit<EmployeeFilters, "page">): Promise<void> {
  const res = await api.get("/employees/export", { params: filters, responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `somhr-employees-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
