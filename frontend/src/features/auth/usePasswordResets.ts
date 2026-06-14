import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

export interface ResetRequest {
  id: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestedAt: string;
  reviewedAt: string | null;
  reviewerRemarks: string | null;
  user: {
    id: string;
    email: string;
    status: string;
    employee: {
      firstName: string;
      lastName: string;
      photoUrl: string | null;
      employeeCode: string;
      department: { name: string } | null;
      designation: { title: string } | null;
    } | null;
  };
}

export function useResetRequests(status: "PENDING" | "APPROVED" | "REJECTED") {
  return useQuery({
    queryKey: ["password-resets", status],
    queryFn: async () => (await api.get<{ data: ResetRequest[] }>("/password-resets/requests", { params: { status } })).data.data,
  });
}

function useReviewMutation(action: "approve" | "reject") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; remarks?: string }) =>
      api.post(`/password-resets/requests/${input.id}/${action}`, action === "reject" ? { remarks: input.remarks } : {}),
    onSuccess: () => {
      toast.success(action === "approve" ? "Temporary password generated and emailed to the employee." : "Request declined.");
      void queryClient.invalidateQueries({ queryKey: ["password-resets"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useApproveReset = () => useReviewMutation("approve");
export const useRejectReset = () => useReviewMutation("reject");

/** Employee asks an admin to reset their password. */
export function useRequestReset() {
  return useMutation({
    mutationFn: (input: { reason?: string }) => api.post("/password-resets/requests", input),
    onSuccess: () => toast.success("Request sent to your admin. You'll be emailed once it's approved."),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
