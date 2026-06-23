import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { useManualMark } from "./useAttendance";

const STATUSES = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "ON_LEAVE", label: "Leave" },
  { value: "WORK_FROM_HOME", label: "Work From Home" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "WEEK_OFF", label: "Week Off" },
];

function timePart(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: { id: string; name: string };
  date: string; // yyyy-mm-dd
  initial?: { status?: string; checkInAt?: string | null; checkOutAt?: string | null };
}

/**
 * Admin attendance editor — add / correct a record directly (no approval workflow).
 * Set status, check-in / check-out and a remark. Works for any employee, including
 * the admin's own record.
 */
export function ManualMarkDialog({ open, onOpenChange, employee, date, initial }: Props) {
  const mark = useManualMark();
  const [status, setStatus] = React.useState(initial?.status ?? "PRESENT");
  const [inTime, setInTime] = React.useState(timePart(initial?.checkInAt));
  const [outTime, setOutTime] = React.useState(timePart(initial?.checkOutAt));
  const [remarks, setRemarks] = React.useState("");

  // Reset fields whenever a new day/employee is opened.
  React.useEffect(() => {
    if (open) {
      setStatus(initial?.status && initial.status !== "FUTURE" ? initial.status : "PRESENT");
      setInTime(timePart(initial?.checkInAt));
      setOutTime(timePart(initial?.checkOutAt));
      setRemarks("");
    }
  }, [open, employee.id, date, initial?.status, initial?.checkInAt, initial?.checkOutAt]);

  const showTimes = status === "PRESENT" || status === "HALF_DAY" || status === "WORK_FROM_HOME";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit attendance — {employee.name}</DialogTitle>
          <DialogDescription>{formatDate(date)} · changes apply immediately, no approval needed.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Status" htmlFor="mm-status" className="col-span-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="mm-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          {showTimes && (
            <>
              <FormField label="Check-in" htmlFor="mm-in">
                <Input id="mm-in" type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
              </FormField>
              <FormField label="Check-out" htmlFor="mm-out">
                <Input id="mm-out" type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
              </FormField>
            </>
          )}
          <FormField label="Remarks" htmlFor="mm-remarks" className="col-span-2">
            <Textarea id="mm-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional note (e.g. regularised by HR)" />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            loading={mark.isPending}
            onClick={async () => {
              await mark.mutateAsync({
                employeeId: employee.id,
                date,
                status,
                checkInAt: showTimes && inTime ? `${date}T${inTime}:00` : null,
                checkOutAt: showTimes && outTime ? `${date}T${outTime}:00` : null,
                remarks: remarks || undefined,
              });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
