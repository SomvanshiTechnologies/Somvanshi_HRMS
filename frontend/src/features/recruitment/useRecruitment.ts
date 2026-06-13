import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export const STAGES = ["APPLIED", "SCREENING", "TECHNICAL", "MANAGERIAL", "HR", "OFFER", "JOINED"] as const;
export const STAGE_LABELS: Record<string, string> = {
  APPLIED: "Applied", SCREENING: "Screening", TECHNICAL: "Technical", MANAGERIAL: "Managerial",
  HR: "HR Round", OFFER: "Offer", JOINED: "Joined", REJECTED: "Rejected",
};

export interface PipelineApplication {
  id: string;
  stage: string;
  posting: { id: string; title: string };
  candidate: {
    id: string; firstName: string; lastName: string; email: string; phone: string | null;
    currentCompany: string | null; currentTitle: string | null; totalExperience: number | null;
    expectedCtc: string | null; noticePeriodDays: number | null; location: string | null;
    source: string | null; skills: string[] | null;
    resumes: Array<{ id: string; fileUrl: string; fileName: string }>;
  };
  scores: Array<{ overallScore: number }>;
  interviews: Array<{ round: string; status: string; scheduledAt: string }>;
  offers: Array<{ id: string; status: string; annualCtc: string }>;
}

export const usePipeline = (postingId?: string) =>
  useQuery({
    queryKey: ["recruitment", "pipeline", postingId ?? "all"],
    queryFn: () => get<{ columns: Array<{ stage: string; applications: PipelineApplication[] }>; rejected: PipelineApplication[] }>("/recruitment/pipeline", postingId ? { postingId } : undefined),
  });

export const useRequisitions = () =>
  useQuery({ queryKey: ["recruitment", "requisitions"], queryFn: () => get<Array<Record<string, any>>>("/recruitment/requisitions") });

export const usePostings = () =>
  useQuery({ queryKey: ["recruitment", "postings"], queryFn: () => get<Array<Record<string, any>>>("/recruitment/postings") });

export const useInterviews = () =>
  useQuery({ queryKey: ["recruitment", "interviews"], queryFn: () => get<Array<Record<string, any>>>("/recruitment/interviews") });

function useRecruitmentMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const msg = (res as { data?: { message?: string } })?.data?.message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["recruitment"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useCreateRequisition = () =>
  useRecruitmentMutation((input: Record<string, unknown>) => api.post("/recruitment/requisitions", input));
export const useDecideRequisition = () =>
  useRecruitmentMutation((input: { id: string; decision: "approve" | "reject"; remarks?: string }) =>
    api.patch(`/recruitment/requisitions/${input.id}/${input.decision}`, { remarks: input.remarks }));
export const usePublishPosting = () =>
  useRecruitmentMutation((input: { requisitionId: string; description: string; location?: string; isRemote?: boolean }) =>
    api.post(`/recruitment/requisitions/${input.requisitionId}/postings`, input));
export const useCreateCandidate = () =>
  useRecruitmentMutation((input: Record<string, unknown>) => api.post("/recruitment/candidates", input));
export const useMoveStage = () =>
  useRecruitmentMutation((input: { id: string; stage: string; rejectionReason?: string }) =>
    api.patch(`/recruitment/applications/${input.id}/stage`, { stage: input.stage, rejectionReason: input.rejectionReason }));
export const useScheduleInterview = () =>
  useRecruitmentMutation((input: Record<string, unknown>) => api.post("/recruitment/interviews", input));
export const useSubmitFeedback = () =>
  useRecruitmentMutation((input: { id: string; body: Record<string, unknown> }) =>
    api.post(`/recruitment/interviews/${input.id}/feedback`, input.body));
export const useCreateOffer = () =>
  useRecruitmentMutation((input: Record<string, unknown>) => api.post("/recruitment/offers", input));
export const useDecideOffer = () =>
  useRecruitmentMutation((input: { id: string; decision: "ACCEPTED" | "DECLINED"; declineReason?: string }) =>
    api.patch(`/recruitment/offers/${input.id}/decision`, input));

export function useUploadResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { candidateId: string; file: File }) => {
      const form = new FormData();
      form.append("file", input.file);
      return api.post(`/recruitment/candidates/${input.candidateId}/resume`, form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Resume uploaded.");
      void queryClient.invalidateQueries({ queryKey: ["recruitment"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

// ---- AI: JD generation + resume parsing ----
export interface GeneratedJd { summary: string; responsibilities: string[]; requirements: string[]; niceToHave: string[]; markdown: string }
export interface ParsedResume {
  summary: string; totalExperienceYears: number | null; currentRole: string | null; currentCompany: string | null;
  location: string | null; emails: string[]; phones: string[]; skills: string[];
  education: Array<{ degree: string; institution: string; year: string | null }>;
  experience: Array<{ company: string; role: string; duration: string | null }>;
}
export interface ResumeMatch { overallScore: number; skillScore: number; experienceScore: number; educationScore: number; matchSummary: string }

export function useGenerateJd() {
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => api.post<{ data: GeneratedJd }>("/recruitment/jobs/generate-description", input).then((r) => r.data.data),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useParseResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { candidateId: string; postingId?: string }) =>
      api.post<{ data: { parsed: ParsedResume; score: ResumeMatch | null } }>(`/recruitment/candidates/${input.candidateId}/parse-resume`, { postingId: input.postingId }).then((r) => r.data.data),
    onSuccess: () => { toast.success("Resume parsed."); void queryClient.invalidateQueries({ queryKey: ["recruitment"] }); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

// ---- onboarding ----

export const useOnboardingInstances = (enabled: boolean) =>
  useQuery({ queryKey: ["onboarding", "instances"], queryFn: () => get<Array<Record<string, any>>>("/onboarding/instances"), enabled });
export const useMyOnboarding = () =>
  useQuery({ queryKey: ["onboarding", "me"], queryFn: () => get<Record<string, any> | null>("/onboarding/me") });

export function useOnboardingAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: "start" | "task" | "sign"; id?: string; body: Record<string, unknown> }) => {
      if (input.type === "start") return api.post("/onboarding/instances", input.body);
      if (input.type === "task") return api.patch(`/onboarding/tasks/${input.id}`, input.body);
      return api.post(`/onboarding/forms/${input.id}/sign`, input.body);
    },
    onSuccess: (res) => {
      const msg = (res.data as { message?: string }).message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["onboarding"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
