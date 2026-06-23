import * as React from "react";
import { toast } from "sonner";
import { Download, Eye, FileText, FileUp, Mail, Receipt, Upload } from "lucide-react";
import { MONTHS, openPayslipPdf, useMyPayslips, useAllPayslips, useEmailPayslip, useImportSinglePayslip, useSalaryEmployees } from "./usePayroll";
import { PayslipViewer } from "./PayslipViewer";
import { ImportDialog } from "@/features/imports/ImportDialog";
import { ImportHistory } from "@/features/imports/ImportHistory";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { compactINR, formatDate } from "@/lib/utils";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";

const inr = (v: string | number) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function PayslipsPage() {
  const { can } = usePermissions();
  const canManage = can("payroll:manage");
  const isAdmin = can("payroll:read_all");
  const myPayslips = useMyPayslips();
  const allPayslips = useAllPayslips();
  const payslips = isAdmin ? allPayslips : myPayslips;
  const emailPayslip = useEmailPayslip();
  const [emailingId, setEmailingId] = React.useState<string | null>(null);
  const singleImport = useImportSinglePayslip();
  const employees = useSalaryEmployees();
  const [singleUploadOpen, setSingleUploadOpen] = React.useState(false);
  const [uploadEmpId, setUploadEmpId] = React.useState("");
  const [uploadMonth, setUploadMonth] = React.useState(new Date().getMonth() + 1);
  const [uploadYear, setUploadYear] = React.useState(new Date().getFullYear());
  const [uploadNet, setUploadNet] = React.useState("");
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const now = new Date();
  const [filterYear, setFilterYear] = React.useState(String(now.getFullYear()));
  const [filterMonth, setFilterMonth] = React.useState("all");

  const filtered = React.useMemo(() => {
    if (!payslips.data) return [];
    return payslips.data.filter((s) => {
      if (filterYear !== "all" && s.year !== Number(filterYear)) return false;
      if (filterMonth !== "all" && s.month !== Number(filterMonth)) return false;
      return true;
    });
  }, [payslips.data, filterYear, filterMonth]);

  const allSlips = payslips.data ?? [];
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const ytdNet = allSlips.filter((s) => s.year === currentYear).reduce((sum, s) => sum + Number(s.netPay), 0);
  const currentMonthNet = allSlips.filter((s) => s.year === currentYear && s.month === currentMonth).reduce((sum, s) => sum + Number(s.netPay), 0);
  const importedCount = allSlips.filter((s) => s.source === "IMPORTED").length;

  const availableYears = React.useMemo(() => {
    const years = new Set(allSlips.map((s) => s.year));
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [allSlips, currentYear]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-text">{isAdmin ? "Payslips" : "My Payslips"}</h1>
        <p className="text-sm text-text-muted">{isAdmin ? "All employee payslips — view, download, import, and manage." : "View, download, and email your published payslips."}</p>
      </div>

      {/* summary cards */}
      {payslips.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="rounded-xl p-4">
            <p className="text-2xl font-semibold text-text tabular-nums">{allSlips.length}</p>
            <p className="text-[11px] uppercase tracking-wide text-text-muted mt-0.5">Total Payslips</p>
          </Card>
          <Card className="rounded-xl p-4">
            <p className="text-2xl font-semibold text-text tabular-nums">{currentMonthNet > 0 ? inr(currentMonthNet) : "---"}</p>
            <p className="text-[11px] uppercase tracking-wide text-text-muted mt-0.5">
              {MONTHS[currentMonth - 1]} {currentYear}
            </p>
          </Card>
          <Card className="rounded-xl p-4">
            <p className="text-2xl font-semibold text-success tabular-nums">{compactINR(ytdNet)}</p>
            <p className="text-[11px] uppercase tracking-wide text-text-muted mt-0.5">YTD Net Pay</p>
          </Card>
          <Card className="rounded-xl p-4">
            <p className="text-2xl font-semibold text-text tabular-nums">{importedCount}</p>
            <p className="text-[11px] uppercase tracking-wide text-text-muted mt-0.5">Imported</p>
          </Card>
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {availableYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          {canManage && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setSingleUploadOpen(true)}><FileUp /> Upload Payslip</Button>
              <ImportDialog type="payslip" title="Bulk import payslips" acceptsPdfs onCompleted={() => payslips.refetch()}>
                <Button variant="secondary" size="sm"><Upload /> Bulk Import</Button>
              </ImportDialog>
            </>
          )}
          <p className="text-xs text-text-faint">{filtered.length} payslip{filtered.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {/* table or empty state */}
      {payslips.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : payslips.isError ? (
        <ErrorState message={apiErrorMessage(payslips.error)} onRetry={() => payslips.refetch()} />
      ) : !allSlips.length ? (
        <Card className="rounded-xl">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-2xl bg-surface-sunken p-5 mb-4">
              <Receipt className="size-10 text-text-faint" />
            </div>
            <p className="text-base font-semibold text-text">No payslips available yet</p>
            <p className="text-sm text-text-muted mt-1 max-w-sm">
              {canManage
                ? "Generate payroll or import historical payslips to get started."
                : "Payslips appear here once payroll is processed and published by your HR team."}
            </p>
            {canManage && (
              <div className="flex gap-3 mt-5">
                <Button variant="secondary" onClick={() => setSingleUploadOpen(true)}><FileUp /> Upload Payslip</Button>
                <ImportDialog type="payslip" title="Bulk import payslips" acceptsPdfs onCompleted={() => payslips.refetch()}>
                  <Button variant="secondary"><Upload /> Bulk Import</Button>
                </ImportDialog>
                <Button onClick={() => window.location.href = "/payroll"}>Generate Payroll</Button>
              </div>
            )}
          </div>
        </Card>
      ) : !filtered.length ? (
        <EmptyState icon={FileText} title="No payslips for this period" description="Try changing the year or month filter." />
      ) : (
        <Card className="rounded-xl overflow-hidden">
          <div className="overflow-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  {isAdmin && <th className="px-4 py-2.5 font-semibold">Employee</th>}
                  <th className="px-4 py-2.5 font-semibold">Period</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Gross</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Deductions</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Net Pay</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Source</th>
                  <th className="px-4 py-2.5 font-semibold">Published</th>
                  <th className="px-4 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((slip) => (
                  <tr key={slip.id} className="border-t border-border hover:bg-surface-sunken/40">
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <p className="font-medium text-text truncate">{slip.employee ? `${slip.employee.firstName} ${slip.employee.lastName}` : "—"}</p>
                        <p className="text-[11px] text-text-faint">{slip.employee?.employeeCode}</p>
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-text whitespace-nowrap">
                      {MONTHS[slip.month - 1]} {slip.year}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text">{inr(slip.grossEarnings)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-danger">{inr(slip.totalDeductions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-text">{inr(slip.netPay)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={statusVariant(slip.status)}>{slip.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={slip.source === "IMPORTED" ? "info" : "default"}>
                        {slip.source === "IMPORTED" ? "Imported" : "Generated"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-text-muted whitespace-nowrap">{slip.publishedAt ? formatDate(slip.publishedAt) : "---"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="View payslip" onClick={() => setOpenId(slip.id)}>
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Download PDF"
                          onClick={() => openPayslipPdf(slip.id).catch((e) => toast.error(apiErrorMessage(e)))}
                        >
                          <Download className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canManage && <ImportHistory type="payslip" title="Payslip import history" />}

      {/* single payslip upload dialog */}
      <Dialog open={singleUploadOpen} onOpenChange={(o) => { if (!o) { setSingleUploadOpen(false); setUploadFile(null); setUploadNet(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Payslip</DialogTitle>
            <DialogDescription>Upload a single payslip file for an employee. Supports PDF, Excel, or document files.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Employee" htmlFor="up-emp" required>
              <Select value={uploadEmpId} onValueChange={setUploadEmpId}>
                <SelectTrigger id="up-emp"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {(employees.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} - {e.employeeCode}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Month" htmlFor="up-month">
                <Select value={String(uploadMonth)} onValueChange={(v) => setUploadMonth(Number(v))}>
                  <SelectTrigger id="up-month"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </FormField>
              <FormField label="Year" htmlFor="up-year">
                <Input id="up-year" type="number" value={uploadYear} onChange={(e) => setUploadYear(Number(e.target.value))} />
              </FormField>
            </div>
            <FormField label="Net Pay (optional)" htmlFor="up-net">
              <Input id="up-net" type="number" min={0} value={uploadNet} onChange={(e) => setUploadNet(e.target.value)} placeholder="e.g. 45000" />
            </FormField>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-surface-sunken/40 px-4 py-6 text-center text-sm hover:border-primary/50 transition-colors">
              <FileUp className="size-6 text-text-faint" />
              {uploadFile ? <strong className="text-text">{uploadFile.name}</strong> : <span className="text-text-muted">Click to choose a PDF, Excel, or document file</span>}
              <input type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" className="hidden" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSingleUploadOpen(false)}>Cancel</Button>
            <Button
              disabled={!uploadEmpId || !uploadFile}
              loading={singleImport.isPending}
              onClick={async () => {
                await singleImport.mutateAsync({ employeeId: uploadEmpId, month: uploadMonth, year: uploadYear, netPay: uploadNet ? Number(uploadNet) : undefined, file: uploadFile! });
                setSingleUploadOpen(false);
                setUploadFile(null);
                setUploadNet("");
              }}
            >
              Upload Payslip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayslipViewer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
