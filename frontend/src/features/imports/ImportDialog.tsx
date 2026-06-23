import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  downloadErrorReport,
  downloadImportTemplate,
  useCommitImport,
  usePreviewImport,
  type ImportBatch,
  type PreviewResult,
} from "./useImports";

type Step = "upload" | "preview" | "done";

interface ImportDialogProps {
  type: string;
  title: string;
  /** Set for the payslip-bulk importer (also accepts attached PDFs). */
  acceptsPdfs?: boolean;
  /** Called after a successful commit so the caller can refetch its data. */
  onCompleted?: () => void;
  /** The trigger element (e.g. a Button). */
  children: React.ReactNode;
}

/**
 * Reusable import flow shared by every module: upload → preview + validation
 * summary → commit → success/failure counts + error report. Driven entirely by
 * the backend Import Engine; the only prop that changes per module is `type`.
 */
export function ImportDialog({ type, title, acceptsPdfs, onCompleted, children }: ImportDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [pdfs, setPdfs] = React.useState<File[]>([]);
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [result, setResult] = React.useState<ImportBatch | null>(null);

  const previewMut = usePreviewImport(type);
  const commitMut = useCommitImport(type);

  function reset() {
    setStep("upload");
    setFile(null);
    setPdfs([]);
    setPreview(null);
    setResult(null);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setTimeout(reset, 200);
  }

  async function runPreview() {
    if (!file) return;
    const data = await previewMut.mutateAsync({ file, pdfs });
    setPreview(data);
    setStep("preview");
  }

  async function runCommit() {
    if (!file) return;
    const batch = await commitMut.mutateAsync({ file, pdfs });
    setResult(batch);
    setStep("done");
    onCompleted?.();
    if (batch.successCount > 0) toast.success(`Imported ${batch.successCount} row${batch.successCount === 1 ? "" : "s"}.`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" /> {title}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Download the template, fill it in, then upload to preview before importing."}
            {step === "preview" && "Review the validation below. Only valid rows will be imported."}
            {step === "done" && "Import finished."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <Button variant="secondary" size="sm" onClick={() => downloadImportTemplate(type)}>
              <Download /> Download template
            </Button>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-sunken/40 px-4 py-8 text-center transition-colors hover:border-primary/50">
              <Upload className="size-6 text-text-faint" />
              <span className="text-sm text-text">
                {file ? <strong>{file.name}</strong> : "Click to choose an .xlsx / .csv file"}
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {acceptsPdfs && (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-sunken/40 px-4 py-6 text-center transition-colors hover:border-primary/50">
                <FileText className="size-5 text-text-faint" />
                <span className="text-sm text-text">
                  {pdfs.length ? <strong>{pdfs.length} PDF{pdfs.length === 1 ? "" : "s"} selected</strong> : "Attach the payslip PDFs referenced in the sheet"}
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => setPdfs(Array.from(e.target.files ?? []))}
                />
              </label>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!file} loading={previewMut.isPending} onClick={runPreview}>
                Preview
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">{preview.totalRows} rows</Badge>
              <Badge variant="success">{preview.validRows} ready to import</Badge>
              {preview.skippedRows > 0 && <Badge variant="warning">{preview.skippedRows} skipped (already exist)</Badge>}
              {preview.invalidRows > 0 && <Badge variant="danger">{preview.invalidRows} with errors</Badge>}
            </div>

            <div className="max-h-[42vh] overflow-auto rounded-lg border border-border scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Row</th>
                    {preview.columns.map((c) => (
                      <th key={c.key} className="px-2 py-2 font-semibold whitespace-nowrap">{c.header}</th>
                    ))}
                    <th className="px-2 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => {
                    const bad = row.errors.length > 0;
                    const warned = !bad && (row.warnings?.length ?? 0) > 0;
                    return (
                      <tr key={row.rowNumber} className={cn("border-t border-border", bad && "bg-danger/5", warned && "bg-warning/5")}>
                        <td className="px-2 py-1.5 tabular-nums text-text-muted">{row.rowNumber}</td>
                        {preview.columns.map((c) => (
                          <td key={c.key} className="px-2 py-1.5 whitespace-nowrap">{String(row.preview[c.key] ?? "")}</td>
                        ))}
                        <td className="px-2 py-1.5">
                          {bad ? (
                            <span className="inline-flex items-center gap-1 text-xs text-danger" title={row.errors.join("; ")}>
                              <AlertTriangle className="size-3.5" /> {row.errors[0]}{row.errors.length > 1 ? ` (+${row.errors.length - 1})` : ""}
                            </span>
                          ) : warned ? (
                            <span className="inline-flex items-center gap-1 text-xs text-warning" title={row.warnings!.join("; ")}>
                              <AlertTriangle className="size-3.5" /> Skipped
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" /> OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {preview.invalidRows > 0 && (
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                <p className="text-sm font-medium text-danger">{preview.invalidRows} row{preview.invalidRows === 1 ? " has" : "s have"} errors and will not be imported.</p>
                <p className="text-xs text-text-muted mt-1">Fix the highlighted rows in your Excel file and re-upload, or proceed to import only the valid rows.</p>
              </div>
            )}

            <DialogFooter>
              <Button variant="secondary" onClick={() => setStep("upload")}>Back</Button>
              <Button disabled={preview.validRows === 0} loading={commitMut.isPending} onClick={runCommit}>
                Import {preview.validRows} row{preview.validRows === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{result.successCount} imported</Badge>
              {result.failureCount > 0 && <Badge variant="danger">{result.failureCount} failed</Badge>}
              <Badge variant={result.status === "COMPLETED" ? "success" : result.status === "FAILED" ? "danger" : "warning"}>{result.status}</Badge>
            </div>
            {result.summary && (
              <div className="rounded-lg border border-border bg-surface-sunken/40 p-3 text-sm text-text-muted">
                {Object.entries(result.summary).map(([k, v]) => (
                  <span key={k} className="mr-4 inline-block">
                    {k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}: <strong className="text-text">{String(v)}</strong>
                  </span>
                ))}
              </div>
            )}
            <DialogFooter>
              {result.failureCount > 0 && (
                <Button variant="secondary" onClick={() => downloadErrorReport(result.id)}>
                  <Download /> Error report
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
