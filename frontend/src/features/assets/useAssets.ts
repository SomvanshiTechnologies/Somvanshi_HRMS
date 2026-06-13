import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export interface Asset {
  id: string;
  assetTag: string;
  category: string;
  name: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: string;
  warrantyEndsAt: string | null;
  purchaseCost: string | null;
  assignments: Array<{ id: string; employee: { id: string; firstName: string; lastName: string; photoUrl: string | null; employeeCode: string } }>;
  _count?: { maintenance: number };
}

export const ASSET_CATEGORIES = ["LAPTOP", "MONITOR", "MOBILE", "SIM", "ACCESS_CARD", "KEYBOARD", "MOUSE", "HEADSET", "FURNITURE", "SOFTWARE_LICENSE", "OTHER"];

export const useAssets = (filters: { status?: string; category?: string; search?: string }) =>
  useQuery({ queryKey: ["assets", filters], queryFn: () => get<Asset[]>("/assets", filters) });
export const useAssetSummary = () =>
  useQuery({ queryKey: ["assets", "summary"], queryFn: () => get<{ total: number; warrantyExpiring: number; byStatus: Record<string, number>; byCategory: Array<{ category: string; count: number }> }>("/assets/summary") });
export const useMyAssets = () =>
  useQuery({ queryKey: ["assets", "me"], queryFn: () => get<Array<Record<string, any>>>("/assets/me") });
export const useAsset = (id: string | null) =>
  useQuery({ queryKey: ["assets", id], queryFn: () => get<Record<string, any>>(`/assets/${id}`), enabled: Boolean(id) });

function useAssetMutation<T>(fn: (input: T) => Promise<unknown>, successMsg?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const msg = (res as { data?: { message?: string } })?.data?.message ?? successMsg;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useCreateAsset = () => useAssetMutation((input: Record<string, unknown>) => api.post("/assets", input));
export const useAssignAsset = () => useAssetMutation((input: { id: string; employeeId: string; remarks?: string }) => api.post(`/assets/${input.id}/assign`, { employeeId: input.employeeId, remarks: input.remarks }));
export const useReturnAsset = () => useAssetMutation((input: { id: string; returnCondition?: string }) => api.post(`/assets/${input.id}/return`, { returnCondition: input.returnCondition }));
export const useLogMaintenance = () => useAssetMutation((input: { id: string; type: string; description: string; cost?: number; vendor?: string }) => api.post(`/assets/${input.id}/maintenance`, input));
