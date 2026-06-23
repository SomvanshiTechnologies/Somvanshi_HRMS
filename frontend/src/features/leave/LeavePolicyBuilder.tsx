import * as React from "react";
import { Plus, Pencil, Trash2, Settings2, Upload } from "lucide-react";
import {
  useAllLeaveTypes,
  useSaveLeaveType,
  useSaveLeavePolicy,
  useDeleteLeavePolicy,
  type AdminLeaveType,
  type AdminLeavePolicy,
} from "./useLeave";
import { useDepartments } from "@/features/employees/useEmployees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ImportDialog } from "@/features/imports/ImportDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ACCRUAL = [
  { value: "YEARLY", label: "Yearly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "NONE", label: "None" },
];
const GENDER = [
  { value: "", label: "Everyone" },
  { value: "FEMALE", label: "Female only" },
  { value: "MALE", label: "Male only" },
];

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
      <input type="checkbox" className="size-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* ---------------- type dialog ---------------- */
function TypeDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: AdminLeaveType | null }) {
  const save = useSaveLeaveType();
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [colorHex, setColorHex] = React.useState("#0A3D62");
  const [isPaid, setIsPaid] = React.useState(true);
  const [isActive, setIsActive] = React.useState(true);
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setCode(initial?.code ?? "");
      setColorHex(initial?.colorHex ?? "#0A3D62");
      setIsPaid(initial?.isPaid ?? true);
      setIsActive(initial?.isActive ?? true);
      setDescription(initial?.description ?? "");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit leave type" : "New leave type"}</DialogTitle>
          <DialogDescription>Define a leave type. Add a policy to set quotas and rules.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Name" htmlFor="lt-name" required className="col-span-2">
            <Input id="lt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Work From Home" />
          </FormField>
          <FormField label="Code" htmlFor="lt-code" required>
            <Input id="lt-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WFH" />
          </FormField>
          <FormField label="Colour" htmlFor="lt-color">
            <Input id="lt-color" type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="h-9 w-full p-1" />
          </FormField>
          <FormField label="Description" htmlFor="lt-desc" className="col-span-2">
            <Textarea id="lt-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <div className="col-span-2 flex gap-6">
            <Toggle label="Paid leave" checked={isPaid} onChange={setIsPaid} />
            <Toggle label="Active" checked={isActive} onChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={name.length < 2 || code.length < 1}
            loading={save.isPending}
            onClick={async () => {
              await save.mutateAsync({ id: initial?.id, name, code, colorHex, isPaid, isActive, description: description || null });
              onOpenChange(false);
            }}
          >
            Save type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- policy dialog ---------------- */
interface PolicyForm {
  name: string;
  annualQuota: string;
  accrualFrequency: string;
  maxCarryForward: string;
  carryForwardExpiryMonths: string;
  maxConsecutiveDays: string;
  minServiceDays: string;
  noticeDays: string;
  allowHalfDay: boolean;
  requiresDocument: boolean;
  genderRestriction: string;
  departmentIds: string[];
  maxNegativeBalance: string;
  encashable: boolean;
  maxEncashmentDays: string;
  isActive: boolean;
}

function blankPolicy(typeName: string): PolicyForm {
  return {
    name: `${typeName} — Standard`,
    annualQuota: "0",
    accrualFrequency: "YEARLY",
    maxCarryForward: "0",
    carryForwardExpiryMonths: "",
    maxConsecutiveDays: "",
    minServiceDays: "0",
    noticeDays: "0",
    allowHalfDay: true,
    requiresDocument: false,
    genderRestriction: "",
    departmentIds: [],
    maxNegativeBalance: "0",
    encashable: false,
    maxEncashmentDays: "0",
    isActive: true,
  };
}

function PolicyDialog({
  open,
  onOpenChange,
  type,
  policy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: AdminLeaveType;
  policy: AdminLeavePolicy | null;
}) {
  const save = useSaveLeavePolicy();
  const departments = useDepartments();
  const [f, setF] = React.useState<PolicyForm>(blankPolicy(type.name));
  const set = <K extends keyof PolicyForm>(k: K, v: PolicyForm[K]) => setF((prev) => ({ ...prev, [k]: v }));

  React.useEffect(() => {
    if (!open) return;
    if (policy) {
      setF({
        name: policy.name,
        annualQuota: String(policy.annualQuota),
        accrualFrequency: policy.accrualFrequency,
        maxCarryForward: String(policy.maxCarryForward),
        carryForwardExpiryMonths: policy.carryForwardExpiryMonths == null ? "" : String(policy.carryForwardExpiryMonths),
        maxConsecutiveDays: policy.maxConsecutiveDays == null ? "" : String(policy.maxConsecutiveDays),
        minServiceDays: String(policy.minServiceDays),
        noticeDays: String(policy.noticeDays),
        allowHalfDay: policy.allowHalfDay,
        requiresDocument: policy.requiresDocument,
        genderRestriction: policy.genderRestriction ?? "",
        departmentIds: policy.departmentIds ?? [],
        maxNegativeBalance: String(policy.maxNegativeBalance),
        encashable: policy.encashable,
        maxEncashmentDays: String(policy.maxEncashmentDays),
        isActive: policy.isActive,
      });
    } else {
      setF(blankPolicy(type.name));
    }
  }, [open, policy, type.name]);

  const numField = (label: string, key: keyof PolicyForm, placeholder?: string) => (
    <FormField label={label} htmlFor={`pf-${key}`}>
      <Input id={`pf-${key}`} type="number" min={0} value={f[key] as string} onChange={(e) => set(key, e.target.value as never)} placeholder={placeholder} />
    </FormField>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{policy ? "Edit policy" : "New policy"} — {type.name}</DialogTitle>
          <DialogDescription>Company-specific rules for this leave type. All settings are saved to the database.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Policy name" htmlFor="pf-name" required className="col-span-2">
            <Input id="pf-name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          </FormField>

          {numField("Annual entitlement (days)", "annualQuota")}
          <FormField label="Accrual" htmlFor="pf-accrual">
            <Select value={f.accrualFrequency} onValueChange={(v) => set("accrualFrequency", v)}>
              <SelectTrigger id="pf-accrual"><SelectValue /></SelectTrigger>
              <SelectContent>{ACCRUAL.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>

          {numField("Max carry-forward (days)", "maxCarryForward")}
          {numField("Carry-forward expiry (months)", "carryForwardExpiryMonths", "never")}

          {numField("Max consecutive days", "maxConsecutiveDays", "no limit")}
          {numField("Notice period (days)", "noticeDays")}

          {numField("Min service (days)", "minServiceDays")}
          <FormField label="Applies to" htmlFor="pf-gender">
            <Select value={f.genderRestriction || "ALL"} onValueChange={(v) => set("genderRestriction", v === "ALL" ? "" : v)}>
              <SelectTrigger id="pf-gender"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Everyone</SelectItem>
                {GENDER.filter((g) => g.value).map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>

          {numField("Negative balance allowed (days)", "maxNegativeBalance")}
          {numField("Max encashment (days)", "maxEncashmentDays")}

          <div className="col-span-2 flex flex-wrap gap-x-6 gap-y-2">
            <Toggle label="Allow half-day" checked={f.allowHalfDay} onChange={(v) => set("allowHalfDay", v)} />
            <Toggle label="Requires document" checked={f.requiresDocument} onChange={(v) => set("requiresDocument", v)} />
            <Toggle label="Encashable" checked={f.encashable} onChange={(v) => set("encashable", v)} />
            <Toggle label="Active" checked={f.isActive} onChange={(v) => set("isActive", v)} />
          </div>

          {/* department restriction */}
          <div className="col-span-2">
            <p className="mb-1.5 text-sm font-medium text-text">Department restriction <span className="font-normal text-text-muted">(none = all departments)</span></p>
            <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border border-border p-3 scrollbar-thin">
              {(departments.data ?? []).map((d) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={f.departmentIds.includes(d.id)}
                    onChange={(e) =>
                      set("departmentIds", e.target.checked ? [...f.departmentIds, d.id] : f.departmentIds.filter((x) => x !== d.id))
                    }
                  />
                  {d.name}
                </label>
              ))}
              {!departments.data?.length && <span className="text-sm text-text-faint">No departments found.</span>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={f.name.length < 2}
            loading={save.isPending}
            onClick={async () => {
              await save.mutateAsync({
                id: policy?.id,
                leaveTypeId: type.id,
                name: f.name,
                annualQuota: Number(f.annualQuota) || 0,
                accrualFrequency: f.accrualFrequency,
                maxCarryForward: Number(f.maxCarryForward) || 0,
                carryForwardExpiryMonths: f.carryForwardExpiryMonths === "" ? null : Number(f.carryForwardExpiryMonths),
                maxConsecutiveDays: f.maxConsecutiveDays === "" ? null : Number(f.maxConsecutiveDays),
                minServiceDays: Number(f.minServiceDays) || 0,
                noticeDays: Number(f.noticeDays) || 0,
                allowHalfDay: f.allowHalfDay,
                requiresDocument: f.requiresDocument,
                genderRestriction: f.genderRestriction || null,
                departmentIds: f.departmentIds.length ? f.departmentIds : null,
                maxNegativeBalance: Number(f.maxNegativeBalance) || 0,
                encashable: f.encashable,
                maxEncashmentDays: Number(f.maxEncashmentDays) || 0,
                isActive: f.isActive,
              });
              onOpenChange(false);
            }}
          >
            Save policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- builder ---------------- */
export function LeavePolicyBuilder() {
  const types = useAllLeaveTypes(true);
  const delPolicy = useDeleteLeavePolicy();
  const [typeDialog, setTypeDialog] = React.useState<{ open: boolean; type: AdminLeaveType | null }>({ open: false, type: null });
  const [policyDialog, setPolicyDialog] = React.useState<{ open: boolean; type: AdminLeaveType; policy: AdminLeavePolicy | null } | null>(null);

  return (
    <Card className="rounded-xl">
      <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-sm">Leave Types & Policies</CardTitle>
          <p className="text-xs text-text-muted mt-0.5">Configure leave types and their company-specific rules. All settings are database-driven.</p>
        </div>
        <div className="flex gap-2">
          <ImportDialog type="leave_type" title="Import leave types" onCompleted={() => types.refetch()}>
            <Button variant="secondary" size="sm"><Upload /> Import Excel</Button>
          </ImportDialog>
          <Button size="sm" onClick={() => setTypeDialog({ open: true, type: null })}><Plus /> New Leave Type</Button>
        </div>
      </CardHeader>
      <CardContent>
        {types.isLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : !types.data?.length ? (
          <EmptyState icon={Settings2} title="No leave types yet" description="Create your first leave type to define company policies." />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Leave Type</th>
                  <th className="px-4 py-2.5 font-semibold">Code</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Quota</th>
                  <th className="px-4 py-2.5 font-semibold">Accrual</th>
                  <th className="px-4 py-2.5 font-semibold text-center">Carry Fwd</th>
                  <th className="px-4 py-2.5 font-semibold">Restrictions</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {types.data.map((t) => {
                  const p = t.policies[0];
                  const restrictions: string[] = [];
                  if (p?.genderRestriction) restrictions.push(p.genderRestriction.toLowerCase() + " only");
                  if (p?.departmentIds?.length) restrictions.push(`${p.departmentIds.length} dept(s)`);
                  if (p?.requiresDocument) restrictions.push("doc required");
                  if (p?.encashable) restrictions.push("encashable");

                  return (
                    <tr key={t.id} className="border-t border-border hover:bg-surface-sunken/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="size-3 shrink-0 rounded-full" style={{ background: t.colorHex }} aria-hidden />
                          <div>
                            <p className="font-medium text-text">{t.name}</p>
                            {t.description && <p className="text-[11px] text-text-muted line-clamp-1">{t.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge variant="default">{t.code}</Badge></td>
                      <td className="px-4 py-3 text-center tabular-nums font-medium">{p ? `${p.annualQuota} days` : "—"}</td>
                      <td className="px-4 py-3 text-text-muted">{p ? p.accrualFrequency.charAt(0) + p.accrualFrequency.slice(1).toLowerCase() : "—"}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{p ? `${p.maxCarryForward}d` : "—"}</td>
                      <td className="px-4 py-3">
                        {restrictions.length ? (
                          <div className="flex flex-wrap gap-1">
                            {restrictions.map((r) => <Badge key={r} variant="warning" className="text-[10px]">{r}</Badge>)}
                          </div>
                        ) : <span className="text-text-faint">None</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Badge variant={t.isActive ? "success" : "warning"}>{t.isActive ? "Active" : "Inactive"}</Badge>
                          <Badge variant={t.isPaid ? "info" : "default"}>{t.isPaid ? "Paid" : "Unpaid"}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon-sm" aria-label="Edit type" onClick={() => setTypeDialog({ open: true, type: t })}>
                            <Pencil className="size-3.5" />
                          </Button>
                          {p ? (
                            <>
                              <Button variant="ghost" size="icon-sm" aria-label="Edit policy" onClick={() => setPolicyDialog({ open: true, type: t, policy: p })}>
                                <Settings2 className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon-sm" aria-label="Delete policy" onClick={() => { if (window.confirm("Delete this policy?")) delPolicy.mutate(p.id); }}>
                                <Trash2 className="size-3.5 text-danger" />
                              </Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="icon-sm" aria-label="Add policy" onClick={() => setPolicyDialog({ open: true, type: t, policy: null })}>
                              <Plus className="size-3.5 text-primary" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <TypeDialog open={typeDialog.open} onOpenChange={(o) => setTypeDialog((s) => ({ ...s, open: o }))} initial={typeDialog.type} />
      {policyDialog && (
        <PolicyDialog
          open={policyDialog.open}
          onOpenChange={(o) => setPolicyDialog(o ? policyDialog : null)}
          type={policyDialog.type}
          policy={policyDialog.policy}
        />
      )}
    </Card>
  );
}
