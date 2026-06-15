import * as React from "react";
import { motion } from "framer-motion";
import { Check, KeyRound, ShieldAlert, X } from "lucide-react";
import { useApproveReset, useRejectReset, useResetRequests, type ResetRequest } from "./usePasswordResets";
import { apiErrorMessage } from "@/lib/api";
import { formatDateTime, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

function statusVariant(s: string) {
  return s === "APPROVED" ? "success" : s === "REJECTED" ? "danger" : "warning";
}

function RequestCard({ r, i }: { r: ResetRequest; i: number }) {
  const approve = useApproveReset();
  const reject = useRejectReset();
  const [rejecting, setRejecting] = React.useState(false);
  const [remarks, setRemarks] = React.useState("");
  const emp = r.user.employee;
  const name = emp ? `${emp.firstName} ${emp.lastName}` : r.user.email;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}>
      <Card className="rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Avatar size="md">{emp?.photoUrl && <AvatarImage src={emp.photoUrl} alt="" />}<AvatarFallback>{initials(emp?.firstName, emp?.lastName)}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-text truncate">{name}</p>
              <Badge variant={statusVariant(r.status) as never}>{r.status}</Badge>
            </div>
            <p className="text-xs text-text-muted truncate">{emp?.designation?.title ?? r.user.email}{emp?.department ? ` · ${emp.department.name}` : ""}</p>
            <p className="mt-2 text-sm text-text">{r.reason || <span className="text-text-faint">No reason provided.</span>}</p>
            <p className="mt-1 text-[11px] text-text-faint">Requested {formatDateTime(r.requestedAt)}{r.reviewedAt ? ` · reviewed ${formatDateTime(r.reviewedAt)}` : ""}</p>
            {r.reviewerRemarks && <p className="mt-1 text-[11px] text-text-muted">Remark: {r.reviewerRemarks}</p>}
          </div>
        </div>
        {r.status === "PENDING" && (
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}><X className="text-danger" /> Decline</Button>
            <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate({ id: r.id })}><Check /> Approve & reset</Button>
          </div>
        )}
      </Card>

      <Dialog open={rejecting} onOpenChange={(o) => !o && setRejecting(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline reset request</DialogTitle>
            <DialogDescription>Optionally tell {emp?.firstName ?? "the employee"} why. They'll be notified.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reason (optional)…" />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejecting(false)}>Cancel</Button>
            <Button
              variant="secondary" className="text-danger" loading={reject.isPending}
              onClick={() => reject.mutate({ id: r.id, remarks: remarks || undefined }, { onSuccess: () => setRejecting(false) })}
            >
              Decline request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function RequestList({ status }: { status: "PENDING" | "APPROVED" | "REJECTED" }) {
  const q = useResetRequests(status);
  if (q.isLoading) return <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>;
  if (q.isError) return <ErrorState message={apiErrorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState icon={KeyRound} title={`No ${status.toLowerCase()} requests`} description="Password reset requests from employees appear here." />;
  return <div className="grid gap-3 sm:grid-cols-2">{q.data.map((r, i) => <RequestCard key={r.id} r={r} i={i} />)}</div>;
}

export function PasswordResetsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text flex items-center gap-2"><ShieldAlert className="size-5 text-primary dark:text-chart-3" /> Password Resets</h1>
        <p className="text-sm text-text-muted">Approve to auto-generate a one-time temporary password — emailed to the employee, never shown to admins. They must set a new password at next login.</p>
      </div>
      <Tabs defaultValue="PENDING">
        <TabsList>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Declined</TabsTrigger>
        </TabsList>
        <TabsContent value="PENDING" className="mt-4"><RequestList status="PENDING" /></TabsContent>
        <TabsContent value="APPROVED" className="mt-4"><RequestList status="APPROVED" /></TabsContent>
        <TabsContent value="REJECTED" className="mt-4"><RequestList status="REJECTED" /></TabsContent>
      </Tabs>
    </div>
  );
}
