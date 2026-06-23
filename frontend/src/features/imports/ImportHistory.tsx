import * as React from "react";
import { Download, History, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { downloadErrorReport, useImportHistory, useRollbackImport, type ImportBatch } from "./useImports";

const STATUS_VARIANT: Record<ImportBatch["status"], "success" | "danger" | "warning" | "default"> = {
  COMPLETED: "success",
  PARTIAL: "warning",
  FAILED: "danger",
  ROLLED_BACK: "default",
  PREVIEW: "default",
};

export function ImportHistory({ type, title = "Import history" }: { type?: string; title?: string }) {
  const history = useImportHistory(type);
  const rollback = useRollbackImport();
  const [deleteTarget, setDeleteTarget] = React.useState<ImportBatch | null>(null);

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2"><History className="size-4" /> {title}</CardTitle>
      </CardHeader>
      <CardContent>
        {history.isLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : !history.data?.length ? (
          <EmptyState icon={History} title="No imports yet" />
        ) : (
          <div className="space-y-2.5">
            {history.data.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">
                    {b.fileName}
                    <Badge variant={STATUS_VARIANT[b.status]} className="ml-2 align-middle">{b.status.replace(/_/g, " ")}</Badge>
                  </p>
                  <p className="text-xs text-text-muted">
                    {b.successCount} imported · {b.failureCount} failed · {b.importedByName ?? "—"} · {formatDate(b.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {b.failureCount > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => downloadErrorReport(b.id)}>
                      <Download /> Errors
                    </Button>
                  )}
                  {b.status !== "ROLLED_BACK" && b.successCount > 0 && (
                    <Button size="sm" variant="secondary" onClick={() => setDeleteTarget(b)}>
                      <Trash2 className="text-danger" /> Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Import</DialogTitle>
            <DialogDescription>
              This will permanently remove {deleteTarget?.successCount} record{deleteTarget?.successCount === 1 ? "" : "s"} created by this import ({deleteTarget?.fileName}).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={rollback.isPending}
              onClick={async () => {
                if (deleteTarget) await rollback.mutateAsync(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              <Trash2 /> Delete Records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
