import type { Importer } from "./import.types.js";
import { attendanceImporter } from "../attendance/attendance.import.js";
import { leaveBalanceImporter, leaveTxnImporter } from "../leave/leave.import.js";
import { payslipImporter } from "../payroll/payslip.import.js";
import { holidayImporter } from "../leave/holiday.import.js";
import { leaveTypeImporter } from "../leave/leaveType.import.js";

/**
 * The registry of every importer in the product. Adding a new bulk import is just:
 *   1. write an `Importer` in the owning module, 2. register it here.
 * The engine (template / preview / commit / history / rollback) and the reusable
 * frontend <ImportDialog> then work for it automatically.
 */
const IMPORTERS: Importer[] = [
  attendanceImporter,
  leaveBalanceImporter,
  leaveTxnImporter,
  payslipImporter,
  holidayImporter,
  leaveTypeImporter,
];

const BY_TYPE = new Map<string, Importer>(IMPORTERS.map((i) => [i.type, i]));

export function getImporter(type: string): Importer | undefined {
  return BY_TYPE.get(type);
}

export function listImporters(): Importer[] {
  return IMPORTERS;
}
