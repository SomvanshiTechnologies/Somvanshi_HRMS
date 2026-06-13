import * as React from "react";
import { CalendarClock, Moon, Plus, UserPlus, Users } from "lucide-react";
import { useAssignShift, useCreateShift, useShifts } from "./useAttendance";
import { useEmployees } from "@/features/employees/useEmployees";
import { apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ShiftsPage() {
  const shifts = useShifts();
  const createShift = useCreateShift();
  const assignShift = useAssignShift();
  const employees = useEmployees({ page: 1, limit: 100, status: "ACTIVE" });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState<string | null>(null); // shiftId
  const [name, setName] = React.useState("");
  const [startTime, setStartTime] = React.useState("09:30");
  const [endTime, setEndTime] = React.useState("18:30");
  const [grace, setGrace] = React.useState(15);
  const [employeeId, setEmployeeId] = React.useState("");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Shift Management</h1>
          <p className="text-sm text-text-muted">Define working windows and assign them to people.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus /> New Shift</Button>
      </div>

      {shifts.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : shifts.isError ? (
        <ErrorState message={apiErrorMessage(shifts.error)} onRetry={() => shifts.refetch()} />
      ) : !shifts.data?.length ? (
        <EmptyState icon={CalendarClock} title="No shifts defined" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {shifts.data.map((shift) => (
            <Card key={shift.id} className="rounded-xl p-5 hover:shadow-raised transition-shadow">
              <div className="flex items-start justify-between">
                <div className="rounded-lg bg-primary/10 p-2.5 text-primary dark:text-chart-3">
                  {shift.isNightShift ? <Moon className="size-5" /> : <CalendarClock className="size-5" />}
                </div>
                <Badge variant="primary"><Users className="size-3" /> {shift._count?.assignments ?? 0}</Badge>
              </div>
              <h3 className="mt-3 font-semibold text-text">{shift.name}</h3>
              <p className="text-sm text-text-muted tabular-nums">{shift.startTime} – {shift.endTime}</p>
              <p className="text-xs text-text-faint mt-0.5">
                {shift.breakMinutes}m break · {shift.graceMinutes}m grace{shift.isNightShift ? " · night shift" : ""}
              </p>
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => { setAssignOpen(shift.id); setEmployeeId(""); }}>
                <UserPlus /> Assign employee
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New shift</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <FormField label="Name" htmlFor="sh-name" required>
              <Input id="sh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Night Support" />
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Starts" htmlFor="sh-start" required>
                <Input id="sh-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </FormField>
              <FormField label="Ends" htmlFor="sh-end" required>
                <Input id="sh-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </FormField>
              <FormField label="Grace (min)" htmlFor="sh-grace">
                <Input id="sh-grace" type="number" min={0} max={120} value={grace} onChange={(e) => setGrace(Number(e.target.value))} />
              </FormField>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={name.length < 2}
              loading={createShift.isPending}
              onClick={async () => {
                await createShift.mutateAsync({ name, startTime, endTime, graceMinutes: grace, breakMinutes: 60, isNightShift: endTime < startTime });
                setCreateOpen(false);
                setName("");
              }}
            >
              Create shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* assign dialog */}
      <Dialog open={Boolean(assignOpen)} onOpenChange={(o) => !o && setAssignOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign shift</DialogTitle></DialogHeader>
          <FormField label="Employee" required>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger aria-label="Employee"><SelectValue placeholder={employees.isLoading ? "Loading…" : "Select employee"} /></SelectTrigger>
              <SelectContent>
                {(employees.data?.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAssignOpen(null)}>Cancel</Button>
            <Button
              disabled={!employeeId}
              loading={assignShift.isPending}
              onClick={async () => {
                await assignShift.mutateAsync({ employeeId, shiftId: assignOpen! });
                setAssignOpen(null);
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
