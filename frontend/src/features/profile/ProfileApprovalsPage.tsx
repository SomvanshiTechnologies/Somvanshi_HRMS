import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, ClipboardCheck, X } from "lucide-react";
import { usePendingChangeRequests, useReviewChangeRequest, type PendingChangeRequest } from "./useProfile";
import { apiErrorMessage } from "@/lib/api";
import { formatDateTime, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";

const FIELD_LABELS: Record<string, string> = {
  personalEmail: "Personal email",
  phone: "Mobile number",
  altPhone: "Alternate mobile",
  currentAddress: "Current address",
  permanentAddress: "Permanent address",
  bloodGroup: "Blood group",
  maritalStatus: "Marital status",
  dateOfBirth: "Date of birth",
};

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  return String(value);
}

export function ProfileApprovalsPage() {
  const requests = usePendingChangeRequests();
  const review = useReviewChangeRequest();
  const [rejecting, setRejecting] = React.useState<PendingChangeRequest | null>(null);
  const [remarks, setRemarks] = React.useState("");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Profile Approvals</h1>
        <p className="text-sm text-text-muted">Review employee-submitted profile changes before they take effect.</p>
      </div>

      {requests.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : requests.isError ? (
        <ErrorState message={apiErrorMessage(requests.error)} onRetry={() => requests.refetch()} />
      ) : !requests.data?.length ? (
        <EmptyState icon={ClipboardCheck} title="No pending requests" description="Employee profile change requests will appear here for review." />
      ) : (
        <div className="space-y-3">
          {requests.data.map((request, i) => (
            <motion.div key={request.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="rounded-xl">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar size="md">
                        {request.employee.photoUrl && <AvatarImage src={request.employee.photoUrl} alt="" />}
                        <AvatarFallback>{initials(request.employee.firstName, request.employee.lastName)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-text">
                          {request.employee.firstName} {request.employee.lastName}
                          <Badge className="ml-2 font-mono text-[10px]">{request.employee.employeeCode}</Badge>
                        </p>
                        <p className="text-xs text-text-muted">
                          {request.employee.designation?.title ?? "—"} · {request.employee.department?.name ?? "—"} ·
                          submitted {formatDateTime(request.submittedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setRejecting(request);
                          setRemarks("");
                        }}
                      >
                        <X className="text-danger" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        loading={review.isPending && review.variables?.id === request.id && review.variables.decision === "approve"}
                        onClick={() => review.mutate({ id: request.id, decision: "approve" })}
                      >
                        <Check /> Approve
                      </Button>
                    </div>
                  </div>

                  {/* diff */}
                  <div className="mt-4 overflow-hidden rounded-lg border border-border">
                    {Object.entries(request.changes).map(([field, { from, to }], idx) => (
                      <div
                        key={field}
                        className={`grid grid-cols-1 sm:grid-cols-[10rem_1fr_auto_1fr] items-center gap-2 px-4 py-2.5 text-sm ${idx % 2 ? "" : "bg-surface-sunken/50"}`}
                      >
                        <span className="font-medium text-text">{FIELD_LABELS[field] ?? field}</span>
                        <span className="text-text-muted line-through decoration-danger/40">{formatValue(from)}</span>
                        <ArrowRight className="hidden sm:block size-4 text-text-faint" aria-hidden />
                        <span className="font-medium text-success">{formatValue(to)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* reject dialog */}
      <Dialog open={Boolean(rejecting)} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject change request</DialogTitle>
            <DialogDescription>
              {rejecting && `From ${rejecting.employee.firstName} ${rejecting.employee.lastName} — the employee will be notified.`}
            </DialogDescription>
          </DialogHeader>
          <FormField label="Reason" htmlFor="reject-remarks">
            <Textarea id="reject-remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Explain what needs correction…" />
          </FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={review.isPending}
              onClick={async () => {
                await review.mutateAsync({ id: rejecting!.id, decision: "reject", remarks: remarks || undefined });
                setRejecting(null);
              }}
            >
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
