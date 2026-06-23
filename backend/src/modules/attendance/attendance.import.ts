import { prisma } from "../../config/db.js";
import type { AttendanceStatus } from "../../generated/prisma/client.js";
import type { CommitResult, ImportColumn, ImportContext, Importer, ParsedRow, RowError, ValidatedRow } from "../imports/import.types.js";
import { PERMISSIONS } from "../../shared/permissions.js";

/**
 * Attendance import — monthly summary rows. Each row is one employee's totals for
 * one month; the importer lays those onto day-level records so the existing month
 * view / exports / payroll see them. Only the exception days (absent / half-day /
 * leave) plus enough present days to fill the month's working days are written, and
 * existing days are never overwritten (so rollback can safely delete what it made).
 */

interface AttendanceImportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  month: number;
  year: number;
  present: number;
  absent: number;
  halfDay: number;
  leave: number;
  workingDays: number | null;
}

const columns: ImportColumn[] = [
  { key: "employeeCode", header: "Employee Code", altHeaders: ["Code", "Emp Code", "Employee ID", "EmpCode"], required: true, example: "EMP001", note: "Must match an existing employee code." },
  { key: "employeeName", header: "Employee Name", altHeaders: ["Name", "Emp Name", "Employee"], example: "Asha Verma", note: "Optional — for your reference only." },
  { key: "month", header: "Month", example: "Jan 2025", note: "Include the year, e.g. 'Jan 2025'. If omitted, inferred from the file name." },
  { key: "present", header: "Present", required: true, example: 22, note: "Days present (whole number)." },
  { key: "absent", header: "Absent", example: 1, note: "Days absent." },
  { key: "halfDay", header: "Half Day", altHeaders: ["Half Days"], example: 1, note: "Half days." },
  { key: "leave", header: "Leave", altHeaders: ["On Leave", "Leaves"], example: 2, note: "Days on leave." },
  { key: "workingDays", header: "Working Days", example: 26, note: "Total working days that month (cross-checked; not required)." },
];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Parse "Jan 2025", "January 2025", "2025-01", "01/2025", "1-2025", or filenames like "attendance-2024-06.xlsx". */
function parseMonthYear(input: string): { month: number; year: number } | null {
  const s = input.trim();
  if (!s) return null;
  const yearMatch = s.match(/(19|20)\d{2}/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[0]);
  const rest = s.replace(yearMatch[0], " ").replace(/[^a-zA-Z0-9]/g, " ").trim().toLowerCase();
  const tokens = rest.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (/^\d{1,2}$/.test(token)) {
      const n = Number(token);
      if (n >= 1 && n <= 12) return { month: n, year };
    }
    const m = MONTHS[token];
    if (m) return { month: m, year };
  }
  return null;
}

function toInt(v: string): number | null {
  if (v.trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const holidayCache = new Map<number, Promise<Set<string>>>();
function holidaysFor(year: number): Promise<Set<string>> {
  let p = holidayCache.get(year);
  if (!p) {
    p = prisma.holiday
      .findMany({ where: { date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) }, isOptional: false }, select: { date: true } })
      .then((rows) => new Set(rows.map((h) => dayKey(h.date))));
    holidayCache.set(year, p);
  }
  return p;
}

export const attendanceImporter: Importer<AttendanceImportRow> = {
  type: "attendance",
  title: "Attendance (monthly summary)",
  description: "Import monthly attendance totals (present / absent / half-day / leave) per employee.",
  permission: PERMISSIONS.ATTENDANCE_MANAGE,
  columns,
  sample: [
    { employeeCode: "EMP001", employeeName: "Asha Verma", month: "Jan 2025", present: 22, absent: 1, halfDay: 1, leave: 2, workingDays: 26 },
    { employeeCode: "EMP002", employeeName: "Rahul Nair", month: "Jan 2025", present: 24, absent: 0, halfDay: 0, leave: 2, workingDays: 26 },
  ],

  async validate(rows: ParsedRow[], ctx: ImportContext): Promise<ValidatedRow<AttendanceImportRow>[]> {
    const codes = [...new Set(rows.map((r) => r.cells["employeeCode"]?.trim()).filter((c): c is string => !!c))];
    const employees = await prisma.employee.findMany({
      where: { employeeCode: { in: codes }, deletedAt: null },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
    const byCode = new Map(employees.map((e) => [e.employeeCode, e]));

    // Infer month/year from filename when the Month column is absent (e.g. "attendance-2024-06.xlsx").
    const filenameMy = ctx.fileName ? parseMonthYear(ctx.fileName) : null;

    return rows.map((row) => {
      const errors: string[] = [];
      const code = (row.cells["employeeCode"] ?? "").trim();
      const emp = code ? byCode.get(code) : undefined;
      if (!code) errors.push("Employee Code is required");
      else if (!emp) errors.push(`No employee with code "${code}"`);

      const cellMonth = (row.cells["month"] ?? "").trim();
      const my = cellMonth ? parseMonthYear(cellMonth) : filenameMy;
      if (!my) errors.push("Month is required — add a Month column or include month/year in the filename (e.g. attendance-Jan-2025.xlsx)");

      const present = toInt(row.cells["present"] ?? "");
      const absent = toInt(row.cells["absent"] ?? "");
      const halfDay = toInt(row.cells["halfDay"] ?? "");
      const leave = toInt(row.cells["leave"] ?? "");
      const workingDays = (row.cells["workingDays"] ?? "").trim() === "" ? null : toInt(row.cells["workingDays"] ?? "");
      for (const [label, val] of [["Present", present], ["Absent", absent], ["Half Day", halfDay], ["Leave", leave]] as const) {
        if (val === null) errors.push(`${label} must be a whole number ≥ 0`);
      }
      const total = (present ?? 0) + (absent ?? 0) + (halfDay ?? 0) + (leave ?? 0);
      if (errors.length === 0 && total === 0) errors.push("All day counts are zero — nothing to import for this row");
      if (errors.length === 0 && total > 31) errors.push(`Day counts total ${total}, which exceeds days in a month`);

      const data: AttendanceImportRow | null =
        errors.length === 0 && emp && my
          ? {
              employeeId: emp.id,
              employeeCode: code,
              employeeName: `${emp.firstName} ${emp.lastName}`,
              month: my.month,
              year: my.year,
              present: present!,
              absent: absent!,
              halfDay: halfDay!,
              leave: leave!,
              workingDays,
            }
          : null;

      return {
        rowNumber: row.rowNumber,
        data,
        errors,
        preview: {
          employeeCode: code,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : (row.cells["employeeName"] ?? ""),
          month: my ? `${String(my.month).padStart(2, "0")}/${my.year}` : (row.cells["month"] ?? ""),
          present: present ?? row.cells["present"],
          absent: absent ?? row.cells["absent"],
          halfDay: halfDay ?? row.cells["halfDay"],
          leave: leave ?? row.cells["leave"],
        },
      };
    });
  },

  async apply(validRows, batchId): Promise<CommitResult> {
    let recordsCreated = 0;
    let daysSkipped = 0;
    const errors: RowError[] = [];
    const employeesTouched = new Set<string>();

    for (const row of validRows) {
      const d = row.data!;
      try {
        // Resolve this employee's working-Saturday rule once.
        const emp = await prisma.employee.findUnique({
          where: { id: d.employeeId },
          select: { department: { select: { workingSaturdays: true } } },
        });
        const workingSats = Array.isArray(emp?.department?.workingSaturdays) ? (emp!.department!.workingSaturdays as number[]) : [];
        const holidays = await holidaysFor(d.year);

        // The month's working days (skip Sundays, non-working Saturdays, holidays).
        const lastDay = new Date(d.year, d.month, 0).getDate();
        const workingDates: Date[] = [];
        for (let day = 1; day <= lastDay; day++) {
          const date = new Date(d.year, d.month - 1, day);
          const dow = date.getDay();
          if (dow === 0) continue; // Sunday
          if (dow === 6 && !workingSats.includes(Math.ceil(day / 7))) continue; // non-working Saturday
          if (holidays.has(dayKey(date))) continue; // company holiday
          workingDates.push(date);
        }

        const exceptions = d.absent + d.halfDay + d.leave;
        if (exceptions > workingDates.length) {
          errors.push({ row: row.rowNumber, employeeCode: d.employeeCode, messages: [`Absent+Half+Leave (${exceptions}) exceeds the month's ${workingDates.length} working days`] });
          continue;
        }

        // Allocate statuses across working days: absent → half → leave → present (rest).
        const statuses: AttendanceStatus[] = [];
        for (let i = 0; i < d.absent; i++) statuses.push("ABSENT");
        for (let i = 0; i < d.halfDay; i++) statuses.push("HALF_DAY");
        for (let i = 0; i < d.leave; i++) statuses.push("ON_LEAVE");
        while (statuses.length < workingDates.length) statuses.push("PRESENT");

        // Create records only where none exist (overwrite-safe → rollback-safe).
        const existing = await prisma.attendanceRecord.findMany({
          where: { employeeId: d.employeeId, date: { gte: workingDates[0], lte: workingDates[workingDates.length - 1] } },
          select: { date: true },
        });
        const existingKeys = new Set(existing.map((r) => dayKey(r.date)));

        const toCreate = workingDates
          .map((date, idx) => ({ date, status: statuses[idx]! }))
          .filter((x) => !existingKeys.has(dayKey(x.date)));
        daysSkipped += workingDates.length - toCreate.length;

        if (toCreate.length > 0) {
          await prisma.attendanceRecord.createMany({
            data: toCreate.map((x) => ({
              employeeId: d.employeeId,
              date: x.date,
              status: x.status,
              remarks: "Imported (monthly summary)",
              importBatchId: batchId,
            })),
          });
          recordsCreated += toCreate.length;
        }
        employeesTouched.add(d.employeeId);
      } catch (err) {
        errors.push({ row: row.rowNumber, employeeCode: d.employeeCode, messages: [(err as Error).message] });
      }
    }

    return {
      successCount: validRows.length - errors.length,
      failureCount: errors.length,
      errors,
      summary: { recordsCreated, daysSkipped, employees: employeesTouched.size },
    };
  },

  async rollback(batchId): Promise<void> {
    await prisma.attendanceRecord.deleteMany({ where: { importBatchId: batchId } });
  },
};
