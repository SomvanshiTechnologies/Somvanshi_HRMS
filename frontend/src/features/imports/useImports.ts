import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

/** Shared client types for the reusable Import Engine. */
export interface ImportColumn {
  key: string;
  header: string;
  required?: boolean;
  note?: string;
}

export interface ValidatedRow {
  rowNumber: number;
  data: unknown | null;
  errors: string[];
  warnings?: string[];
  preview: Record<string, unknown>;
}

export interface PreviewResult {
  type: string;
  columns: ImportColumn[];
  rows: ValidatedRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  skippedRows: number;
}

export interface ImportBatch {
  id: string;
  type: string;
  fileName: string;
  status: "PREVIEW" | "COMPLETED" | "PARTIAL" | "FAILED" | "ROLLED_BACK";
  totalRows: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ row: number; employeeCode?: string; messages: string[] }> | null;
  summary: Record<string, unknown> | null;
  importedByName: string | null;
  rolledBackAt: string | null;
  createdAt: string;
}

function buildForm(file: File, pdfs?: File[]): FormData {
  const form = new FormData();
  form.append("file", file);
  for (const p of pdfs ?? []) form.append("pdfs", p);
  return form;
}

async function downloadBlob(url: string, fallbackName: string): Promise<void> {
  const res = await api.get(url, { responseType: "blob" });
  const disposition = (res.headers["content-disposition"] as string | undefined) ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const name = match?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}

export const downloadImportTemplate = (type: string) =>
  downloadBlob(`/imports/${type}/template`, `somhr-${type}-template.xlsx`).catch((err) => toast.error(apiErrorMessage(err)));

export const downloadErrorReport = (id: string) =>
  downloadBlob(`/imports/${id}/errors`, `somhr-import-${id}-errors.xlsx`).catch((err) => toast.error(apiErrorMessage(err)));

export function usePreviewImport(type: string) {
  return useMutation({
    mutationFn: (input: { file: File; pdfs?: File[] }) =>
      api
        .post<{ data: PreviewResult }>(`/imports/${type}/preview`, buildForm(input.file, input.pdfs), {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data.data),
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export function useCommitImport(type: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; pdfs?: File[] }) =>
      api
        .post<{ data: ImportBatch }>(`/imports/${type}/commit`, buildForm(input.file, input.pdfs), {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useImportHistory = (type?: string) =>
  useQuery({
    queryKey: ["imports", type ?? "all"],
    queryFn: () =>
      api.get<{ data: ImportBatch[] }>("/imports", { params: type ? { type } : {} }).then((r) => r.data.data),
  });

export function useRollbackImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/imports/${id}/rollback`),
    onSuccess: () => {
      toast.success("Import rolled back.");
      void queryClient.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
