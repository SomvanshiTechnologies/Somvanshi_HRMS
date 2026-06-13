import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Download, Eye, FileText, Wallet } from "lucide-react";
import { MONTHS, openPayslipPdf, useMyPayslips } from "./usePayroll";
import { PayslipViewer } from "./PayslipViewer";
import { apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";

const inr = (v: string | number) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function PayslipsPage() {
  const payslips = useMyPayslips();
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text">My Payslips</h1>
          <p className="text-sm text-text-muted">Published payslips with full earnings and deduction breakdowns.</p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-text-faint">
          <FileText className="size-3.5" /> You can also ask Sera "download my payslip".
        </p>
      </div>

      {payslips.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      ) : payslips.isError ? (
        <ErrorState message={apiErrorMessage(payslips.error)} onRetry={() => payslips.refetch()} />
      ) : !payslips.data?.length ? (
        <EmptyState icon={Wallet} title="No payslips yet" description="Payslips appear here once payroll for the month is approved and published." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {payslips.data.map((slip, i) => (
            <motion.div key={slip.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="overflow-hidden rounded-xl hover:shadow-raised transition-shadow cursor-pointer" onClick={() => setOpenId(slip.id)}>
                <div className="flex items-center justify-between bg-gradient-to-r from-primary to-(--chart-2) px-4 py-3 text-white">
                  <p className="font-semibold">{MONTHS[slip.month - 1]} {slip.year}</p>
                  <Badge className="bg-white/15 text-white border-white/20">{Number(slip.paidDays)} paid days</Badge>
                </div>
                <div className="p-4">
                  <p className="text-2xl font-semibold text-text tabular-nums">{inr(slip.netPay)}</p>
                  <p className="text-xs text-text-muted">net pay · gross {inr(slip.grossEarnings)} − deductions {inr(slip.totalDeductions)}</p>
                  <div className="mt-3 space-y-1 border-t border-border pt-2.5">
                    {(slip.lines ?? []).slice(0, 4).map((line) => (
                      <div key={line.id} className="flex justify-between text-xs">
                        <span className="text-text-muted">{line.label}</span>
                        <span className={line.type === "DEDUCTION" ? "text-danger tabular-nums" : "text-text tabular-nums"}>
                          {line.type === "DEDUCTION" ? "−" : ""}{inr(line.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1" size="sm" onClick={(e) => { e.stopPropagation(); setOpenId(slip.id); }}>
                      <Eye /> View
                    </Button>
                    <Button className="flex-1" size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openPayslipPdf(slip.id).catch((err) => toast.error(apiErrorMessage(err))); }}>
                      <Download /> PDF
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
      <PayslipViewer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
