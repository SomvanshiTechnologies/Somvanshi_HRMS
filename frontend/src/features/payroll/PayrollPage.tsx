import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Banknote, Check, CreditCard, Download, FileText, FileUp, Play, Upload, Users, Wallet } from "lucide-react";
import {
  MONTHS, downloadRegister, openPayslipPdf, useImportSinglePayslip, useProcessRun, useRun, useRunAction,
  useRuns, useSalaryEmployees, useSetSalary, useStructures, type PayrollRun,
} from "./usePayroll";
import { ImportDialog } from "@/features/imports/ImportDialog";
import { ImportHistory } from "@/features/imports/ImportHistory";
import { apiErrorMessage } from "@/lib/api";
import { cn, compactINR, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";

const inr = (v: string | number) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/* ---------- runs tab ---------- */
function RunsTab() {
  const { can } = usePermissions();
  const runs = useRuns();
  const processRun = useProcessRun();
  const runAction = useRunAction();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const run = useRun(selectedId);
  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());

  return (
    <div className="space-y-4">
      {can("payroll:run") && (
        <Card className="rounded-xl p-4 flex flex-wrap items-end gap-3">
          <FormField label="Month">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-40" aria-label="Month"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Year" htmlFor="run-year">
            <Input id="run-year" type="number" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </FormField>
          <Button loading={processRun.isPending} onClick={() => processRun.mutate({ month, year })}>
            <Play /> Process Payroll
          </Button>
          <p className="text-xs text-text-faint basis-full">
            Computes every payslip from live salaries, attendance and LOP leave. Runs lock after approval.
          </p>
        </Card>
      )}

      {runs.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : runs.isError ? (
        <ErrorState message={apiErrorMessage(runs.error)} onRetry={() => runs.refetch()} />
      ) : !runs.data?.length ? (
        <EmptyState icon={Banknote} title="No payroll runs yet" description="Process your first month above." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {runs.data.map((r: PayrollRun, i) => (
            <motion.button
              key={r.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              onClick={() => setSelectedId(r.id)}
              className={cn(
                "rounded-xl border bg-surface p-4 text-left shadow-card hover:shadow-raised transition-shadow cursor-pointer",
                selectedId === r.id ? "border-primary" : "border-border"
              )}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-text">{MONTHS[r.month - 1]} {r.year}</p>
                <Badge variant={statusVariant(r.status)}>{r.status.replace("_", " ")}</Badge>
              </div>
              <p className="mt-2 text-2xl font-semibold text-text tabular-nums">{compactINR(Number(r.totalNet))}</p>
              <p className="text-xs text-text-muted">net · {r.employeeCount} employees · gross {compactINR(Number(r.totalGross))}</p>
            </motion.button>
          ))}
        </div>
      )}

      {/* run detail */}
      {selectedId && run.data && (
        <Card className="rounded-xl">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">{MONTHS[run.data.month - 1]} {run.data.year} — payslips</CardTitle>
              {run.data.remarks && <p className="text-xs text-warning mt-0.5">{run.data.remarks}</p>}
            </div>
            <div className="flex gap-2">
              {can("payroll:export") && (
                <Button variant="secondary" size="sm" onClick={() => downloadRegister(selectedId).catch((e) => toast.error(apiErrorMessage(e)))}>
                  <Download /> Register
                </Button>
              )}
              {can("payroll:approve") && run.data.status === "PENDING_APPROVAL" && (
                <Button size="sm" loading={runAction.isPending} onClick={() => runAction.mutate({ id: selectedId, action: "approve" })}>
                  <Check /> Approve & Publish
                </Button>
              )}
              {can("payroll:approve") && run.data.status === "APPROVED" && (
                <Button size="sm" loading={runAction.isPending} onClick={() => runAction.mutate({ id: selectedId, action: "mark-paid" })}>
                  <CreditCard /> Mark Paid
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {run.data.payslips.map((slip) => (
              <div key={slip.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar size="sm">
                    {slip.employee?.photoUrl && <AvatarImage src={slip.employee.photoUrl} alt="" />}
                    <AvatarFallback>{initials(slip.employee?.firstName, slip.employee?.lastName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">{slip.employee?.firstName} {slip.employee?.lastName}</p>
                    <p className="text-[11px] text-text-muted">paid {Number(slip.paidDays)}d · LOP {Number(slip.lopDays)}d</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-text tabular-nums">{inr(slip.netPay)}</span>
                  <Button variant="ghost" size="icon-sm" aria-label="View PDF" onClick={() => openPayslipPdf(slip.id).catch((e) => toast.error(apiErrorMessage(e)))}>
                    <FileText />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ---------- salaries tab ---------- */
function SalariesTab() {
  const { can } = usePermissions();
  const employees = useSalaryEmployees();
  const structures = useStructures();
  const setSalary = useSetSalary();
  const [editFor, setEditFor] = React.useState<{ id: string; name: string } | null>(null);
  const [ctc, setCtc] = React.useState("");
  const [structureId, setStructureId] = React.useState("");

  React.useEffect(() => {
    if (structures.data?.length && !structureId) setStructureId(structures.data[0]!.id);
  }, [structures.data, structureId]);

  return (
    <div className="space-y-3">
      {employees.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : employees.isError ? (
        <ErrorState message={apiErrorMessage(employees.error)} onRetry={() => employees.refetch()} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {(employees.data ?? []).map((e) => {
            const salary = e.salaries[0];
            return (
              <Card key={e.id} className="rounded-xl p-4">
                <div className="flex items-center gap-2.5">
                  <Avatar size="sm">
                    {e.photoUrl && <AvatarImage src={e.photoUrl} alt="" />}
                    <AvatarFallback>{initials(e.firstName, e.lastName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text truncate">{e.firstName} {e.lastName}</p>
                    <p className="text-[11px] text-text-muted truncate">{e.designation?.title ?? "—"} · {e.employeeCode}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  {salary ? (
                    <div>
                      <p className="text-lg font-semibold text-text tabular-nums">{compactINR(Number(salary.annualCtc))}<span className="text-xs font-normal text-text-muted"> /yr</span></p>
                      <p className="text-[11px] text-text-muted">{inr(salary.monthlyGross)}/mo · since {formatDate(salary.effectiveFrom)}</p>
                    </div>
                  ) : (
                    <Badge variant="warning">No salary set</Badge>
                  )}
                  {can("payroll:manage") && (
                    <Button variant="secondary" size="sm" onClick={() => { setEditFor({ id: e.id, name: `${e.firstName} ${e.lastName}` }); setCtc(salary ? String(Number(salary.annualCtc)) : ""); }}>
                      <Wallet /> {salary ? "Revise" : "Set"}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(editFor)} onOpenChange={(o) => !o && setEditFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set salary — {editFor?.name}</DialogTitle>
            <DialogDescription>BASIC 50% of gross · HRA 50% of basic · balance Special Allowance · PF/PT/ESI/TDS</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Structure">
              <Select value={structureId} onValueChange={setStructureId}>
                <SelectTrigger aria-label="Structure"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(structures.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Annual CTC (₹)" htmlFor="ctc" required hint={ctc ? `≈ ${inr(Number(ctc) / 12)} gross per month` : undefined}>
              <Input id="ctc" type="number" min={0} value={ctc} onChange={(e) => setCtc(e.target.value)} placeholder="e.g. 600000" />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditFor(null)}>Cancel</Button>
            <Button
              disabled={!ctc || Number(ctc) <= 0 || !structureId}
              loading={setSalary.isPending}
              onClick={async () => {
                await setSalary.mutateAsync({ employeeId: editFor!.id, structureId, annualCtc: Number(ctc) });
                setEditFor(null);
              }}
            >
              Save salary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- imports tab (historical payslips) ---------- */
function ImportsTab() {
  const employees = useSalaryEmployees();
  const single = useImportSinglePayslip();
  const now = new Date();
  const [employeeId, setEmployeeId] = React.useState("");
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const [netPay, setNetPay] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* single upload */}
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><FileUp className="size-4 text-primary" /> Single payslip</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Employee">
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger aria-label="Employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {(employees.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.employeeCode}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Month">
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger aria-label="Month"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </FormField>
              <FormField label="Year" htmlFor="imp-year">
                <Input id="imp-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
              </FormField>
            </div>
            <FormField label="Net Pay (optional)" htmlFor="imp-net">
              <Input id="imp-net" type="number" min={0} value={netPay} onChange={(e) => setNetPay(e.target.value)} placeholder="e.g. 45000" />
            </FormField>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-surface-sunken/40 px-4 py-5 text-center text-sm hover:border-primary/50">
              <Upload className="size-5 text-text-faint" />
              {file ? <strong>{file.name}</strong> : "Choose payslip PDF"}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <Button
              className="w-full"
              disabled={!employeeId || !file}
              loading={single.isPending}
              onClick={async () => {
                await single.mutateAsync({ employeeId, month, year, netPay: netPay ? Number(netPay) : undefined, file: file! });
                setFile(null); setNetPay("");
              }}
            >
              Import payslip
            </Button>
          </CardContent>
        </Card>

        {/* bulk upload */}
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Upload className="size-4 text-primary" /> Bulk import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-text-muted">
              Upload an Excel mapping (Employee Code, Month, Year, PDF File) together with the matching PDF files. Preview and validate before importing.
            </p>
            <ImportDialog type="payslip" title="Bulk import payslips" acceptsPdfs>
              <Button variant="secondary"><Upload /> Start bulk import</Button>
            </ImportDialog>
          </CardContent>
        </Card>
      </div>

      <ImportHistory type="payslip" title="Payslip import history" />
    </div>
  );
}

export function PayrollPage() {
  const { can } = usePermissions();
  const canManage = can("payroll:manage");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Payroll</h1>
        <p className="text-sm text-text-muted">Monthly runs computed from live attendance and leave — locked after approval.</p>
      </div>
      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs"><Banknote /> Runs</TabsTrigger>
          <TabsTrigger value="salaries"><Users /> Salaries</TabsTrigger>
          {canManage && <TabsTrigger value="imports"><FileUp /> Import payslips</TabsTrigger>}
        </TabsList>
        <TabsContent value="runs"><RunsTab /></TabsContent>
        <TabsContent value="salaries"><SalariesTab /></TabsContent>
        {canManage && <TabsContent value="imports"><ImportsTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
