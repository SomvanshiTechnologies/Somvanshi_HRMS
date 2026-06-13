import * as React from "react";
import { toast } from "sonner";
import {
  Banknote, CalendarCheck2, ChevronDown, Download, FileSpreadsheet, FileText, Mail,
  TrendingDown, TrendingUp, Wallet, X,
} from "lucide-react";
import {
  amountInWords, downloadPayslipCsv, openPayslipPdf, useEmailPayslip, usePayslipDetail,
} from "./usePayroll";
import { apiErrorMessage } from "@/lib/api";
import { cn, formatDate, formatINR, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import logoUrl from "@/assets/brand/logo_STech.jpg";

const inr = (v: number) => formatINR(v);

function paymentBadge(status: string): { label: string; variant: string } {
  if (status === "PAID") return { label: "Paid", variant: "success" };
  if (status === "APPROVED") return { label: "Processed", variant: "info" };
  return { label: "Pending", variant: "warning" };
}

function Kpi({ label, value, sub, icon: Icon, accent }: { label: string; value: React.ReactNode; sub?: string; icon: typeof Wallet; accent: string }) {
  return (
    <Card className="rounded-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
        <Icon className={cn("size-4", accent)} />
      </div>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", accent)}>{value}</p>
      {sub && <p className="text-[11px] text-text-faint">{sub}</p>}
    </Card>
  );
}

function LineCard({ label, amount, tone }: { label: string; amount: number; tone: "earn" | "deduct" }) {
  return (
    <div className={cn("rounded-lg border p-3 flex items-center justify-between", tone === "deduct" ? "border-warning/30 bg-warning/5" : "border-border bg-surface")}>
      <span className="text-sm text-text">{label}</span>
      <span className={cn("text-sm font-semibold tabular-nums", tone === "deduct" ? "text-warning" : "text-text")}>{tone === "deduct" ? "−" : ""}{inr(amount)}</span>
    </div>
  );
}

export function PayslipViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = usePayslipDetail(id);
  const email = useEmailPayslip();
  const [showBreakdown, setShowBreakdown] = React.useState(false);
  const d = detail.data;

  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col">
        {detail.isLoading || !d ? (
          <div className="p-6"><Skeleton className="h-[70vh] rounded-xl" /></div>
        ) : (
          <>
            {/* header */}
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-lg bg-white p-1.5 shadow-sm shrink-0"><img src={logoUrl} alt="Somvanshi" className="h-6 w-auto" /></div>
                <div className="min-w-0">
                  <p className="font-semibold text-text truncate">{d.company.name}</p>
                  <p className="text-xs text-text-muted">Payslip · {d.period.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={paymentBadge(d.payment.status).variant as never}>{paymentBadge(d.payment.status).label}</Badge>
                <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}><X className="size-4" /></Button>
              </div>
            </div>

            {/* actions */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-sunken px-5 py-2 shrink-0">
              <Button size="sm" variant="secondary" onClick={() => openPayslipPdf(d.id).catch((e) => toast.error(apiErrorMessage(e)))}><FileText className="size-3.5" /> PDF</Button>
              <Button size="sm" variant="secondary" onClick={() => downloadPayslipCsv(d)}><FileSpreadsheet className="size-3.5" /> Excel</Button>
              <Button size="sm" variant="secondary" loading={email.isPending} onClick={() => email.mutate(d.id)}><Mail className="size-3.5" /> Email to me</Button>
            </div>

            {/* body */}
            <div className="overflow-y-auto scrollbar-thin p-5 space-y-5 bg-surface-sunken">
              {/* employee summary */}
              <Card className="rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Avatar size="lg">{d.employee.photoUrl && <AvatarImage src={d.employee.photoUrl} alt="" />}<AvatarFallback className="text-lg">{initials(...d.employee.name.split(" ") as [string, string])}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-text">{d.employee.name}</p>
                    <p className="text-sm text-text-muted">{d.employee.designation ?? "—"}{d.employee.department ? ` · ${d.employee.department}` : ""}</p>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                      <div><span className="text-text-faint">Employee ID</span><p className="text-text font-medium">{d.employee.code}</p></div>
                      <div><span className="text-text-faint">Location</span><p className="text-text font-medium">{d.employee.location ?? "—"}</p></div>
                      <div><span className="text-text-faint">Date of Joining</span><p className="text-text font-medium">{d.employee.dateOfJoining ? formatDate(d.employee.dateOfJoining) : "—"}</p></div>
                      <div><span className="text-text-faint">Employment Type</span><p className="text-text font-medium">{d.employee.employmentType.replace("_", " ").toLowerCase()}</p></div>
                      <div><span className="text-text-faint">Pay Period</span><p className="text-text font-medium">{d.period.label}</p></div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* salary highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <Kpi label="Gross Salary" value={inr(d.totals.gross)} icon={TrendingUp} accent="text-text" />
                <Kpi label="Deductions" value={inr(d.totals.deductions)} icon={TrendingDown} accent="text-warning" />
                <Kpi label="Net Salary" value={inr(d.totals.net)} icon={Wallet} accent="text-success" />
                <Kpi label="Paid Days" value={d.attendance.paidDays} icon={CalendarCheck2} accent="text-primary dark:text-chart-3" />
                <Kpi label="LOP Days" value={d.attendance.lopDays} sub={d.attendance.attendancePct != null ? `${d.attendance.attendancePct}% attendance` : undefined} icon={CalendarCheck2} accent={d.attendance.lopDays > 0 ? "text-danger" : "text-text"} />
              </div>

              {/* earnings + deductions */}
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-text mb-2 flex items-center gap-2"><TrendingUp className="size-4 text-success" /> Earnings</p>
                  <div className="space-y-2">{d.earnings.map((e) => <LineCard key={e.label} label={e.label} amount={e.amount} tone="earn" />)}
                    <div className="rounded-lg bg-surface-sunken p-3 flex items-center justify-between font-semibold"><span className="text-sm text-text">Gross Earnings</span><span className="text-sm tabular-nums text-text">{inr(d.totals.gross)}</span></div>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-text mb-2 flex items-center gap-2"><TrendingDown className="size-4 text-warning" /> Deductions</p>
                  <div className="space-y-2">{d.deductions.map((e) => <LineCard key={e.label} label={e.label} amount={e.amount} tone="deduct" />)}
                    <div className="rounded-lg bg-surface-sunken p-3 flex items-center justify-between font-semibold"><span className="text-sm text-text">Total Deductions</span><span className="text-sm tabular-nums text-warning">−{inr(d.totals.deductions)}</span></div>
                  </div>
                </div>
              </div>

              {/* net pay hero */}
              <Card className="rounded-xl p-5 bg-gradient-to-br from-primary to-secondary text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/70">Net Salary</p>
                    <p className="text-3xl font-bold tabular-nums">{inr(d.totals.net)}</p>
                    <p className="text-xs text-white/80 mt-1">Rupees {amountInWords(d.totals.net)} Only</p>
                  </div>
                  <Wallet className="size-10 text-white/30" />
                </div>
                <p className="mt-3 text-xs text-white/70 border-t border-white/15 pt-2.5">Amount credited to bank account{d.bank ? ` ••••${d.bank.accountLast4}` : ""}{d.payment.paidAt ? ` on ${formatDate(d.payment.paidAt)}` : ""}.</p>
              </Card>

              {/* bank + attendance */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-xl p-4">
                  <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><Banknote className="size-4 text-primary dark:text-chart-3" /> Bank & Payment</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div><span className="text-text-faint">Bank</span><p className="text-text font-medium">{d.bank?.bankName ?? "—"}</p></div>
                    <div><span className="text-text-faint">Account</span><p className="text-text font-medium font-mono">{d.bank ? `••••${d.bank.accountLast4}` : "—"}</p></div>
                    <div><span className="text-text-faint">IFSC</span><p className="text-text font-medium font-mono">{d.bank?.ifsc ?? "—"}</p></div>
                    <div><span className="text-text-faint">Payment Date</span><p className="text-text font-medium">{d.payment.paidAt ? formatDate(d.payment.paidAt) : "—"}</p></div>
                    <div><span className="text-text-faint">UTR</span><p className="text-text font-medium">{d.payment.utr ?? "—"}</p></div>
                    <div><span className="text-text-faint">Status</span><p><Badge variant={paymentBadge(d.payment.status).variant as never}>{paymentBadge(d.payment.status).label}</Badge></p></div>
                  </div>
                </Card>
                <Card className="rounded-xl p-4">
                  <p className="text-sm font-semibold text-text mb-3 flex items-center gap-2"><CalendarCheck2 className="size-4 text-primary dark:text-chart-3" /> Attendance</p>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs">
                    <div><span className="text-text-faint">Working Days</span><p className="text-text font-medium tabular-nums">{d.attendance.workingDays ?? "—"}</p></div>
                    <div><span className="text-text-faint">Present</span><p className="text-text font-medium tabular-nums">{d.attendance.present ?? "—"}</p></div>
                    <div><span className="text-text-faint">Paid Days</span><p className="text-text font-medium tabular-nums">{d.attendance.paidDays}</p></div>
                    <div><span className="text-text-faint">Leave</span><p className="text-text font-medium tabular-nums">{d.attendance.leaveDays ?? "—"}</p></div>
                    <div><span className="text-text-faint">LOP</span><p className="text-text font-medium tabular-nums">{d.attendance.lopDays}</p></div>
                    <div><span className="text-text-faint">Attendance</span><p className="text-success font-semibold tabular-nums">{d.attendance.attendancePct != null ? `${d.attendance.attendancePct}%` : "—"}</p></div>
                  </div>
                </Card>
              </div>

              {/* expandable salary structure / YTD */}
              <Card className="rounded-xl overflow-hidden">
                <button onClick={() => setShowBreakdown((s) => !s)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-text hover:bg-surface-sunken transition-colors cursor-pointer">
                  <span className="flex items-center gap-2"><Download className="size-4 text-text-muted" /> Salary structure & Year-to-Date</span>
                  <ChevronDown className={cn("size-4 text-text-muted transition-transform", showBreakdown && "rotate-180")} />
                </button>
                {showBreakdown && (
                  <div className="border-t border-border p-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Salary structure</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-text-muted">Monthly gross</span><span className="tabular-nums text-text">{d.ctc ? inr(d.ctc.monthly) : "—"}</span></div>
                        <div className="flex justify-between"><span className="text-text-muted">Annual CTC</span><span className="tabular-nums text-text">{d.ctc ? inr(d.ctc.annual) : "—"}</span></div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Year to Date (FY)</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-text-muted">Gross YTD</span><span className="tabular-nums text-text">{inr(d.ytd.gross)}</span></div>
                        <div className="flex justify-between"><span className="text-text-muted">Net YTD</span><span className="tabular-nums text-text">{inr(d.ytd.net)}</span></div>
                        <div className="flex justify-between"><span className="text-text-muted">TDS YTD</span><span className="tabular-nums text-text">{inr(d.ytd.tds)}</span></div>
                        <div className="flex justify-between"><span className="text-text-muted">PF YTD</span><span className="tabular-nums text-text">{inr(d.ytd.pf)}</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              <p className="text-[11px] text-text-faint text-center pb-1">This is a system-generated payslip from Somvanshi HRMS and does not require a signature.</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
