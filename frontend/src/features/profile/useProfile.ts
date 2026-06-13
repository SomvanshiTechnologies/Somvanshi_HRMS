import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

export interface CompletionSection {
  complete: boolean;
  weight: number;
  hint: string;
}

export interface MyProfile {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  personalEmail: string | null;
  phone: string | null;
  altPhone: string | null;
  photoUrl: string | null;
  dateOfBirth: string | null;
  gender: string;
  maritalStatus: string;
  bloodGroup: string | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  languages: string[] | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  careerInterests: string | null;
  status: string;
  employmentType: string;
  dateOfJoining: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; title: string } | null;
  location: { id: string; name: string } | null;
  manager: { id: string; firstName: string; lastName: string; photoUrl: string | null; designation: { title: string } | null } | null;
  reports: Array<{ id: string; firstName: string; lastName: string; photoUrl: string | null }>;
  skills: Array<{ skill: { id: string; name: string }; level: number }>;
  certifications: Array<Record<string, any>>;
  educations: Array<Record<string, any>>;
  experiences: Array<Record<string, any>>;
  bankDetails: Array<Record<string, any>>;
  emergencyContacts: Array<Record<string, any>>;
  documents: Array<Record<string, any>>;
  completion: { score: number; sections: Record<string, CompletionSection> };
  missingDocuments: string[];
  expiringDocuments: Array<Record<string, any>>;
  pendingChangeRequest: { id: string; changes: Record<string, { from: unknown; to: unknown }>; submittedAt: string } | null;
}

export function useMyProfile() {
  return useQuery({
    queryKey: ["profile", "me"],
    queryFn: async () => (await api.get<{ data: MyProfile }>("/profile/me")).data.data,
  });
}

function invalidateProfile(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["profile"] });
  void queryClient.invalidateQueries({ queryKey: ["me"] });
}

export function useUpdateProfessional() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.patch("/profile/me/professional", input),
    onSuccess: () => {
      toast.success("Professional info updated.");
      invalidateProfile(queryClient);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post("/profile/me/photo", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Profile photo updated.");
      invalidateProfile(queryClient);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useCreateChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { changes: Record<string, unknown>; isDraft?: boolean }) =>
      api.post("/profile/me/change-requests", input),
    onSuccess: (_res, vars) => {
      toast.success(vars.isDraft ? "Draft saved." : "Submitted for HR review.");
      invalidateProfile(queryClient);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useCancelChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/profile/me/change-requests/${id}`),
    onSuccess: () => {
      toast.success("Request cancelled.");
      invalidateProfile(queryClient);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; category: string; name: string; expiresOn?: string }) => {
      const form = new FormData();
      form.append("file", input.file);
      form.append("category", input.category);
      form.append("name", input.name);
      if (input.expiresOn) form.append("expiresOn", input.expiresOn);
      return api.post("/profile/me/documents", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Document uploaded.");
      invalidateProfile(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["profile", "documents"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

// ---- bank details (self-service add / edit / delete) ----
export interface BankInput { accountHolder: string; accountNumber: string; bankName: string; branch?: string; ifsc?: string; isPrimary?: boolean }

function useBankMutation<T>(fn: (input: T) => Promise<unknown>, msg: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { toast.success(msg); invalidateProfile(queryClient); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useAddBank = () => useBankMutation((input: { employeeId: string } & BankInput) => { const { employeeId, ...body } = input; return api.post(`/employees/${employeeId}/bank-details`, body); }, "Bank account added.");
export const useUpdateBank = () => useBankMutation((input: { employeeId: string; id: string } & Partial<BankInput>) => { const { employeeId, id, ...body } = input; return api.put(`/employees/${employeeId}/bank-details/${id}`, body); }, "Bank details updated.");
export const useDeleteBank = () => useBankMutation((input: { employeeId: string; id: string }) => api.delete(`/employees/${input.employeeId}/bank-details/${input.id}`), "Bank account removed.");

export function useMyDocuments() {
  return useQuery({
    queryKey: ["profile", "documents"],
    queryFn: async () =>
      (await api.get<{ data: Array<{ current: Record<string, any>; history: Array<Record<string, any>> }> }>("/profile/me/documents")).data.data,
  });
}

// ---- HR review ----

export interface PendingChangeRequest {
  id: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  submittedAt: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    department: { name: string } | null;
    designation: { title: string } | null;
  };
}

export function usePendingChangeRequests() {
  return useQuery({
    queryKey: ["profile", "approvals"],
    queryFn: async () =>
      (await api.get<{ data: PendingChangeRequest[] }>("/profile/change-requests", { params: { status: "PENDING" } })).data.data,
  });
}

export function useReviewChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; decision: "approve" | "reject"; remarks?: string }) =>
      api.patch(`/profile/change-requests/${input.id}/${input.decision}`, { remarks: input.remarks }),
    onSuccess: (_res, vars) => {
      toast.success(vars.decision === "approve" ? "Changes approved and applied." : "Request rejected.");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
