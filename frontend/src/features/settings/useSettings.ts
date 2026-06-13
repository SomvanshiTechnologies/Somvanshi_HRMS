import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

export interface AppSettings {
  defaultManagerId: string | null;
  defaultLocationId: string | null;
  probationMonths: number;
  weekStartsOn: "SUNDAY" | "MONDAY";
  workingDaysPerWeek: number;
  emailNotifications: boolean;
}

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => api.get<{ data: AppSettings }>("/settings").then((r) => r.data.data), staleTime: 300_000 });

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<AppSettings>) => api.put("/settings", input),
    onSuccess: () => { toast.success("Settings saved."); void queryClient.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
