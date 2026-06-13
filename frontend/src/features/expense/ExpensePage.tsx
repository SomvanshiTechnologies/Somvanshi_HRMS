import * as React from "react";
import { motion } from "framer-motion";
import {
  BadgeIndianRupee, CheckCircle2, Plus, Receipt, Send, Trash2, Wallet, XCircle,
} from "lucide-react";
import {
  EXPENSE_STATUSES, useCreateExpense, useDecideExpense, useExpenseCategories,
  useExpenseReport, useExpenseReports, useExpenseSummary, useReimburseExpense,
  useSubmitExpense, type ExpenseReport, type NewExpenseItem,
} from "./useExpense";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { cn, formatDate, formatINR, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";

const inr = (v: string | number) => formatINR(Number(v));

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

function ReportCard({ report, onOpen }: { report: ExpenseReport; onOpen: () => void }) {
  return (
    <Card className="rounded-xl p-4 hover:shadow-raised transition-shadow cursor-pointer" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary dark:text-chart-3"><Receipt className="size-5" /></div>
        <StatusBadge status={report.status} />
      </div>
      <h3 className="mt-3 font-semibold text-text truncate">{report.title}</h3>
      <p className="text-2xl font-semibold text-text tabular-nums mt-1">{inr(report.totalAmount)}</p>
      <p className="text-xs text-text-muted">{report.items.length} item{report.items.length === 1 ? "" : "s"} · {report.submittedAt ? `submitted ${formatDate(report.submittedAt)}` : `drafted ${formatDate(report.createdAt)}`}</p>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <Avatar size="sm">
          {report.employee.photoUrl && <AvatarImage src={report.employee.photoUrl} alt="" />}
          <AvatarFallback>{initials(report.employee.firstName, report.employee.lastName)}</AvatarFallback>
        </Avatar>
        <span className="text-xs text-text-muted truncate">{report.employee.firstName} {report.employee.lastName}</span>
      </div>
    </Card>
  );
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const categories = useExpenseCategories();
  const createExpense = useCreateExpense();
  const [title, setTitle] = React.useState("");
  const [items, setItems] = React.useState<NewExpenseItem[]>([{ categoryId: "", date: "", amount: 0, description: "", receiptUrl: "" }]);

  const reset = () => { setTitle(""); setItems([{ categoryId: "", date: "", amount: 0, description: "", receiptUrl: "" }]); };
  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const valid = title.trim().length >= 3 && items.length > 0 && items.every((it) => it.categoryId && it.date && Number(it.amount) > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New expense claim</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <FormField label="Claim title" required hint="e.g. Client visit — Mumbai, June"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
          {items.map((it, idx) => (
            <Card key={idx} className="rounded-lg p-3 bg-surface-sunken">
              <div className="grid grid-cols-2 gap-2.5">
                <FormField label="Category" required>
                  <Select value={it.categoryId} onValueChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, categoryId: v } : x))}>
                    <SelectTrigger aria-label="Category"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.maxAmount ? ` (≤ ${inr(c.maxAmount)})` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </FormField>
                <FormField label="Date" required><Input type="date" value={it.date} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, date: e.target.value } : x))} /></FormField>
                <FormField label="Amount (₹)" required><Input type="number" min={0} value={it.amount || ""} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))} /></FormField>
                <FormField label="Receipt URL"><Input value={it.receiptUrl} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, receiptUrl: e.target.value } : x))} placeholder="Link to uploaded receipt" /></FormField>
                <FormField label="Description" className="col-span-2"><Input value={it.description} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} /></FormField>
              </div>
              {items.length > 1 && (
                <button type="button" className="mt-2 text-xs text-danger flex items-center gap-1 hover:underline" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                  <Trash2 className="size-3.5" /> Remove item
                </button>
              )}
            </Card>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setItems([...items, { categoryId: "", date: "", amount: 0, description: "", receiptUrl: "" }])}>
            <Plus /> Add line item
          </Button>
        </div>
        <DialogFooter className="items-center">
          <span className="mr-auto text-sm text-text-muted">Total <span className="font-semibold text-text tabular-nums">{inr(total)}</span></span>
          <Button variant="secondary" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          <Button
            disabled={!valid}
            loading={createExpense.isPending}
            onClick={async () => {
              await createExpense.mutateAsync({
                title,
                items: items.map((it) => ({ categoryId: it.categoryId, date: it.date, amount: Number(it.amount), description: it.description || undefined, receiptUrl: it.receiptUrl || undefined })),
              });
              onOpenChange(false);
              reset();
            }}
          >
            Save draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { can } = usePermissions();
  const canApprove = can("expense:approve", "expense:manage");
  const canReimburse = can("expense:manage");
  const report = useExpenseReport(id);
  const submit = useSubmitExpense();
  const decide = useDecideExpense();
  const reimburse = useReimburseExpense();
  const [remarks, setRemarks] = React.useState("");

  const r = report.data;
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader><SheetTitle>{r?.title ?? "Expense claim"}</SheetTitle></SheetHeader>
        <SheetBody className="space-y-4">
          {report.isLoading || !r ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <StatusBadge status={r.status} />
                <span className="text-2xl font-semibold text-text tabular-nums">{inr(r.totalAmount)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Avatar size="sm">
                  {r.employee.photoUrl && <AvatarImage src={r.employee.photoUrl} alt="" />}
                  <AvatarFallback>{initials(r.employee.firstName, r.employee.lastName)}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-text">{r.employee.firstName} {r.employee.lastName}</span>
                <span className="text-xs text-text-faint">· {r.employee.employeeCode}</span>
              </div>

              <div className="space-y-1.5">
                {r.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-text">{it.category.name}</p>
                      <p className="text-xs text-text-muted truncate">{formatDate(it.date)}{it.description ? ` · ${it.description}` : ""}{it.receiptUrl ? "" : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {it.receiptUrl && <a href={it.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">receipt</a>}
                      <span className="text-sm tabular-nums text-text">{inr(it.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {r.approverRemarks && (
                <div className="rounded-lg bg-surface-sunken p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-text-faint mb-0.5">Approver remarks</p>
                  {r.approverRemarks}
                </div>
              )}
              {r.reimbursement?.paidAt && (
                <div className="rounded-lg bg-success/10 p-3 text-sm text-success">
                  Reimbursed {inr(r.reimbursement.amount)} via {r.reimbursement.paidVia?.replace("_", " ").toLowerCase()} on {formatDate(r.reimbursement.paidAt)}
                  {r.reimbursement.reference ? ` · ref ${r.reimbursement.reference}` : ""}
                </div>
              )}

              {/* actions */}
              {r.status === "DRAFT" && (
                <Button className="w-full" loading={submit.isPending} onClick={async () => { await submit.mutateAsync(r.id); }}>
                  <Send /> Submit for approval
                </Button>
              )}
              {canApprove && (r.status === "SUBMITTED" || r.status === "PENDING_APPROVAL") && (
                <div className="space-y-2 border-t border-border pt-3">
                  <Textarea placeholder="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
                  <div className="flex gap-2">
                    <Button className="flex-1" loading={decide.isPending} onClick={async () => { await decide.mutateAsync({ id: r.id, decision: "APPROVED", remarks: remarks || undefined }); setRemarks(""); }}>
                      <CheckCircle2 /> Approve
                    </Button>
                    <Button variant="danger" className="flex-1" loading={decide.isPending} onClick={async () => { await decide.mutateAsync({ id: r.id, decision: "REJECTED", remarks: remarks || undefined }); setRemarks(""); }}>
                      <XCircle /> Reject
                    </Button>
                  </div>
                </div>
              )}
              {canReimburse && r.status === "APPROVED" && (
                <Button className="w-full" loading={reimburse.isPending} onClick={async () => { await reimburse.mutateAsync({ id: r.id, paidVia: "BANK_TRANSFER" }); }}>
                  <Wallet /> Mark reimbursed
                </Button>
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function ReportGrid({ scope, status }: { scope: "mine" | "all"; status: string }) {
  const reports = useExpenseReports({ scope, status: status === "all" ? undefined : status });
  const [openId, setOpenId] = React.useState<string | null>(null);

  if (reports.isLoading) return <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>;
  if (reports.isError) return <ErrorState message={apiErrorMessage(reports.error)} onRetry={() => reports.refetch()} />;
  const list = reports.data?.reports ?? [];
  if (!list.length) return <EmptyState icon={Receipt} title="No expense claims" description={scope === "mine" ? "Create a claim to get reimbursed for business expenses." : "No claims to review right now."} />;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((rep, i) => (
          <motion.div key={rep.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
            <ReportCard report={rep} onOpen={() => setOpenId(rep.id)} />
          </motion.div>
        ))}
      </div>
      <DetailSheet id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function Filters({ status, setStatus }: { status: string; setStatus: (s: string) => void }) {
  return (
    <Select value={status} onValueChange={setStatus}>
      <SelectTrigger className="w-44 h-9" aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {EXPENSE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ExpensePage() {
  const { can } = usePermissions();
  const isReviewer = can("expense:read_all", "expense:approve", "expense:manage");
  const summary = useExpenseSummary(isReviewer);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [mineStatus, setMineStatus] = React.useState("all");
  const [reviewStatus, setReviewStatus] = React.useState("all");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Expenses</h1>
          <p className="text-sm text-text-muted">Submit business expense claims and track reimbursements.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus /> New Claim</Button>
      </div>

      {isReviewer && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Pending claims", value: summary.data?.pendingCount, accent: "text-warning" },
            { label: "Pending amount", value: summary.data ? inr(summary.data.pendingAmount) : undefined, accent: "text-text" },
            { label: "Approved", value: summary.data?.byStatus["APPROVED"] ?? 0, accent: "text-success" },
            { label: "Reimbursed (total)", value: summary.data ? inr(summary.data.reimbursedAmount) : undefined, accent: "text-info" },
          ].map((c) => (
            <Card key={c.label} className="rounded-xl p-4">
              <p className={cn("text-xl font-semibold tabular-nums", c.accent)}>{summary.isLoading ? <Skeleton className="h-7 w-14" /> : c.value ?? 0}</p>
              <p className="text-[11px] uppercase tracking-wide text-text-muted mt-0.5">{c.label}</p>
            </Card>
          ))}
        </div>
      )}

      {isReviewer ? (
        <Tabs defaultValue="review">
          <TabsList>
            <TabsTrigger value="review"><BadgeIndianRupee /> To Review</TabsTrigger>
            <TabsTrigger value="mine"><Receipt /> My Claims</TabsTrigger>
          </TabsList>
          <TabsContent value="review" className="space-y-3">
            <Filters status={reviewStatus} setStatus={setReviewStatus} />
            <ReportGrid scope="all" status={reviewStatus} />
          </TabsContent>
          <TabsContent value="mine" className="space-y-3">
            <Filters status={mineStatus} setStatus={setMineStatus} />
            <ReportGrid scope="mine" status={mineStatus} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-3">
          <Filters status={mineStatus} setStatus={setMineStatus} />
          <ReportGrid scope="mine" status={mineStatus} />
        </div>
      )}

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
