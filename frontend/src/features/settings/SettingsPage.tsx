import * as React from "react";
import { Building2, Save, Settings2, UserCog } from "lucide-react";
import { useSettings, useUpdateSettings, type AppSettings } from "./useSettings";
import { useEmployees, useLocations } from "@/features/employees/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";
import { BrandingSettings } from "./BrandingSettings";

const NONE = "__none__";

export function SettingsPage() {
  const { can } = usePermissions();
  const canManage = can("settings:manage");
  const settings = useSettings();
  const update = useUpdateSettings();
  const employees = useEmployees({ page: 1, limit: 200, status: "ACTIVE" });
  const locations = useLocations();
  const [form, setForm] = React.useState<AppSettings | null>(null);

  React.useEffect(() => { if (settings.data && !form) setForm(settings.data); }, [settings.data, form]);

  if (settings.isLoading || !form) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-72 rounded-xl" /></div>;

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-text flex items-center gap-2"><Settings2 className="size-5 text-primary dark:text-chart-3" /> Settings</h1>
        <p className="text-sm text-text-muted">Organization-wide defaults, branding and preferences.</p>
      </div>

      <BrandingSettings canManage={canManage} />

      <Card className="rounded-xl p-5 space-y-4">
        <p className="font-semibold text-text flex items-center gap-2"><UserCog className="size-4 text-primary dark:text-chart-3" /> People defaults</p>
        <FormField label="Default reporting manager" hint="Pre-selected when adding a new employee">
          <Select value={form.defaultManagerId ?? NONE} onValueChange={(v) => set("defaultManagerId", v === NONE ? null : v)} disabled={!canManage}>
            <SelectTrigger aria-label="Default manager"><SelectValue placeholder="No default" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No default</SelectItem>
              {(employees.data?.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Default location" hint="Pre-selected for new employees">
          <Select value={form.defaultLocationId ?? NONE} onValueChange={(v) => set("defaultLocationId", v === NONE ? null : v)} disabled={!canManage}>
            <SelectTrigger aria-label="Default location"><SelectValue placeholder="No default" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No default</SelectItem>
              {(locations.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Probation period (months)">
          <Input type="number" min={0} max={24} value={form.probationMonths} disabled={!canManage} onChange={(e) => set("probationMonths", Number(e.target.value))} className="w-32" />
        </FormField>
      </Card>

      <Card className="rounded-xl p-5 space-y-4">
        <p className="font-semibold text-text flex items-center gap-2"><Building2 className="size-4 text-primary dark:text-chart-3" /> Workweek & notifications</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Week starts on">
            <Select value={form.weekStartsOn} onValueChange={(v) => set("weekStartsOn", v as AppSettings["weekStartsOn"])} disabled={!canManage}>
              <SelectTrigger aria-label="Week starts on"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="MONDAY">Monday</SelectItem><SelectItem value="SUNDAY">Sunday</SelectItem></SelectContent>
            </Select>
          </FormField>
          <FormField label="Working days / week">
            <Input type="number" min={1} max={7} value={form.workingDaysPerWeek} disabled={!canManage} onChange={(e) => set("workingDaysPerWeek", Number(e.target.value))} />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" checked={form.emailNotifications} disabled={!canManage} onChange={(e) => set("emailNotifications", e.target.checked)} /> Send transactional emails (welcome, reset, payslips)</label>
      </Card>

      {canManage ? (
        <Button loading={update.isPending} onClick={() => update.mutate(form)}><Save /> Save settings</Button>
      ) : (
        <p className="text-sm text-text-faint">You have read-only access to settings.</p>
      )}
    </div>
  );
}
