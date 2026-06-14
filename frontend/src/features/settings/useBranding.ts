import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

export interface Branding {
  tagline: string;
  logoUrl: string | null;
  letterheadUrl: string | null;
  stampUrl: string | null;
  signatures: { hr: string | null; ceo: string | null; director: string | null };
  signatory: { name: string; title: string };
  footer: { website: string; email: string; phone: string };
  watermark: "" | "CONFIDENTIAL" | "OFFICIAL DOCUMENT" | "EMPLOYEE COPY";
}

export type BrandingAssetType = "logo" | "letterhead" | "stamp" | "signatureHr" | "signatureCeo" | "signatureDirector";

export function useBranding() {
  return useQuery({
    queryKey: ["branding"],
    queryFn: async () => (await api.get<{ data: Branding }>("/branding")).data.data,
  });
}

export function useUpdateBranding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Branding>) => api.put("/branding", patch),
    onSuccess: () => {
      toast.success("Branding saved.");
      void queryClient.invalidateQueries({ queryKey: ["branding"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useUploadBrandingAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: BrandingAssetType; file: File }) => {
      const form = new FormData();
      form.append("file", input.file);
      form.append("type", input.type);
      return api.post("/branding/asset", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Asset uploaded.");
      void queryClient.invalidateQueries({ queryKey: ["branding"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
