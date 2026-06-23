import { prisma } from "../../config/db.js";
import type { LeaveRequestStatus } from "../../generated/prisma/client.js";
import type { CommitResult, ImportColumn, Importer, ParsedRow, RowError, ValidatedRow } from "../imports/import.types.js";
import { PERMISSIONS } from "../../shared/permissions.js";

/**
 * Leave imports — two importers sharing the engine:
 *   • leave_balance — opening balances per employee / leave type / year
 *   • leave_txn     — historical leave transactions (already-decided requests)
 * Both are create-only (they error on an existing row) so rollback can simply
 * delete what the batch created.
 */

interface LeaveTypeLite {
  id: string;
  code: string;
  name: string;
}

async function leaveTypeIndex(): Promise<Map<string, LeaveTypeLite>> {
  const types = await prisma.leaveType.findMany({ select: { id: true, code: true, name: true } });
  const idx = new Map<string, LeaveTypeLite>();
  for (const t of types) {
    idx.set(t.code.trim().toLowerCase(), t);
    idx.set(t.name.trim().toLowerCase(), t);
  }
  return idx;
}

function numOrNull(v: string): number | null {
  if (v.trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  // Accept yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy.
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------ */
/* leave balances                                                      */
/* ------------------------------------------------------------------ */

interface BalanceRow {
  employeeId: string;
  employeeCode: string;
  leaveTypeId: string;
  year: number;
  entitled: number;
  used: number;
  carriedOver: number;
}

const balanceColumns: ImportColumn[] = [
  { key: "employeeCode", header: "Employee Code", required: true, example: "EMP001" },
  { key: "leaveType", header: "Leave Type", required: true, example: "CL", note: "Leave type code (CL/SL/EL…) or name." },
  { key: "year", header: "Year", required: true, example: 2025 },
  { key: "entitled", header: "Entitled", required: true, example: 12, note: "Opening entitlement for the year." },
  { key: "used", header: "Used", example: 3 },
  { key: "carriedOver", header: "Carried Over", example: 2, note: "Days carried from the previous year." },
];

export const leaveBalanceImporter: Importer<BalanceRow> = {
  type: "leave_balance",
  title: "Leave balances",
  description: "Import opening leave balances per employee, leave type and year.",
  permission: PERMISSIONS.LEAVE_MANAGE,
  columns: balanceColumns,
  sample: [
    { employeeCode: "EMP001", leaveType: "CL", year: 2025, entitled: 12, used: 3, carriedOver: 2 },
    { employeeCode: "EMP001", leaveType: "SL", year: 2025, entitled: 10, used: 0, carriedOver: 0 },
  ],

  async validate(rows: ParsedRow[]): Promise<ValidatedRow<BalanceRow>[]> {
    const codes = [...new Set(rows.map((r) => r.cells["employeeCode"]?.trim()).filter((c): c is string => !!c))];
    const [employees, types] = await Promise.all([
      prisma.employee.findMany({ where: { employeeCode: { in: codes }, deletedAt: null }, select: { id: true, employeeCode: true } }),
      leaveTypeIndex(),
    ]);
    const byCode = new Map(employees.map((e) => [e.employeeCode, e]));

    // Existing balances to flag duplicates.
    const existing = await prisma.leaveBalance.findMany({
      where: { employee: { employeeCode: { in: codes } } },
      select: { year: true, employee: { select: { employeeCode: true } }, leaveType: { select: { code: true } } },
    });
    const existKey = new Set(existing.map((b) => `${b.employee.employeeCode}|${b.leaveType.code}|${b.year}`));

    return rows.map((row) => {
      const errors: string[] = [];
      const code = (row.cells["employeeCode"] ?? "").trim();
      const emp = code ? byCode.get(code) : undefined;
      if (!emp) errors.push(code ? `No employee with code "${code}"` : "Employee Code is required");

      const lt = types.get((row.cells["leaveType"] ?? "").trim().toLowerCase());
      if (!lt) errors.push(`Unknown leave type "${row.cells["leaveType"]}"`);

      const year = Number((row.cells["year"] ?? "").trim());
      if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push("Year must be a 4-digit year");

      const entitled = numOrNull(row.cells["entitled"] ?? "");
      const used = numOrNull(row.cells["used"] ?? "");
      const carriedOver = numOrNull(row.cells["carriedOver"] ?? "");
      if (entitled === null || used === null || carriedOver === null) errors.push("Entitled / Used / Carried Over must be numbers");

      if (emp && lt && !errors.length && existKey.has(`${code}|${lt.code}|${year}`)) {
        errors.push(`A ${lt.code} balance for ${code} ${year} already exists`);
      }

      const data: BalanceRow | null =
        errors.length === 0 && emp && lt
          ? { employeeId: emp.id, employeeCode: code, leaveTypeId: lt.id, year, entitled: entitled!, used: used!, carriedOver: carriedOver! }
          : null;

      return {
        rowNumber: row.rowNumber,
        data,
        errors,
        preview: { employeeCode: code, leaveType: lt?.code ?? row.cells["leaveType"], year: row.cells["year"], entitled: row.cells["entitled"], used: row.cells["used"] },
      };
    });
  },

  async apply(validRows, batchId): Promise<CommitResult> {
    const errors: RowError[] = [];
    let created = 0;
    for (const row of validRows) {
      const d = row.data!;
      try {
        await prisma.leaveBalance.create({
          data: { employeeId: d.employeeId, leaveTypeId: d.leaveTypeId, year: d.year, entitled: d.entitled, used: d.used, carriedOver: d.carriedOver, importBatchId: batchId },
        });
        created += 1;
      } catch (err) {
        errors.push({ row: row.rowNumber, employeeCode: d.employeeCode, messages: [(err as Error).message] });
      }
    }
    return { successCount: created, failureCount: errors.length, errors, summary: { balancesCreated: created } };
  },

  async rollback(batchId): Promise<void> {
    await prisma.leaveBalance.deleteMany({ where: { importBatchId: batchId } });
  },
};

/* ------------------------------------------------------------------ */
/* leave transactions                                                  */
/* ------------------------------------------------------------------ */

interface TxnRow {
  employeeId: string;
  employeeCode: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  days: number;
  status: LeaveRequestStatus;
  reason: string;
}

const VALID_STATUS = new Set(["APPROVED", "REJECTED", "CANCELLED", "WITHDRAWN"]);

const txnColumns: ImportColumn[] = [
  { key: "employeeCode", header: "Employee Code", required: true, example: "EMP001" },
  { key: "leaveType", header: "Leave Type", required: true, example: "CL", note: "Leave type code or name." },
  { key: "startDate", header: "Start Date", required: true, example: "2025-01-10", note: "yyyy-mm-dd or dd/mm/yyyy." },
  { key: "endDate", header: "End Date", required: true, example: "2025-01-11" },
  { key: "days", header: "Days", example: 2, note: "Optional — computed from the dates if blank." },
  { key: "status", header: "Status", example: "APPROVED", note: "APPROVED (default), REJECTED, CANCELLED or WITHDRAWN." },
  { key: "reason", header: "Reason", example: "Family function" },
];

export const leaveTxnImporter: Importer<TxnRow> = {
  type: "leave_txn",
  title: "Leave transactions",
  description: "Import historical (already-decided) leave records. Does not change balances.",
  permission: PERMISSIONS.LEAVE_MANAGE,
  columns: txnColumns,
  sample: [
    { employeeCode: "EMP001", leaveType: "CL", startDate: "2025-01-10", endDate: "2025-01-11", days: 2, status: "APPROVED", reason: "Family function" },
  ],

  async validate(rows: ParsedRow[]): Promise<ValidatedRow<TxnRow>[]> {
    const codes = [...new Set(rows.map((r) => r.cells["employeeCode"]?.trim()).filter((c): c is string => !!c))];
    const [employees, types] = await Promise.all([
      prisma.employee.findMany({ where: { employeeCode: { in: codes }, deletedAt: null }, select: { id: true, employeeCode: true } }),
      leaveTypeIndex(),
    ]);
    const byCode = new Map(employees.map((e) => [e.employeeCode, e]));

    return rows.map((row) => {
      const errors: string[] = [];
      const code = (row.cells["employeeCode"] ?? "").trim();
      const emp = code ? byCode.get(code) : undefined;
      if (!emp) errors.push(code ? `No employee with code "${code}"` : "Employee Code is required");

      const lt = types.get((row.cells["leaveType"] ?? "").trim().toLowerCase());
      if (!lt) errors.push(`Unknown leave type "${row.cells["leaveType"]}"`);

      const start = parseDate(row.cells["startDate"] ?? "");
      const end = parseDate(row.cells["endDate"] ?? "");
      if (!start) errors.push("Start Date is invalid");
      if (!end) errors.push("End Date is invalid");
      if (start && end && end < start) errors.push("End Date is before Start Date");

      let days = numOrNull(row.cells["days"] ?? "");
      if (days === 0 && start && end) days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      if (days === null || days <= 0) errors.push("Days must be a positive number");

      const statusRaw = (row.cells["status"] ?? "APPROVED").trim().toUpperCase() || "APPROVED";
      if (!VALID_STATUS.has(statusRaw)) errors.push(`Status must be one of ${[...VALID_STATUS].join(", ")}`);

      const data: TxnRow | null =
        errors.length === 0 && emp && lt && start && end
          ? {
              employeeId: emp.id,
              employeeCode: code,
              leaveTypeId: lt.id,
              startDate: start,
              endDate: end,
              days: days!,
              status: statusRaw as LeaveRequestStatus,
              reason: (row.cells["reason"] ?? "").trim() || "Imported historical leave",
            }
          : null;

      return {
        rowNumber: row.rowNumber,
        data,
        errors,
        preview: { employeeCode: code, leaveType: lt?.code ?? row.cells["leaveType"], startDate: row.cells["startDate"], endDate: row.cells["endDate"], days: days ?? "", status: statusRaw },
      };
    });
  },

  async apply(validRows, batchId): Promise<CommitResult> {
    const errors: RowError[] = [];
    let created = 0;
    for (const row of validRows) {
      const d = row.data!;
      try {
        await prisma.leaveRequest.create({
          data: {
            employeeId: d.employeeId,
            leaveTypeId: d.leaveTypeId,
            startDate: d.startDate,
            endDate: d.endDate,
            days: d.days,
            reason: d.reason,
            status: d.status,
            actedAt: new Date(),
            importBatchId: batchId,
          },
        });
        created += 1;
      } catch (err) {
        errors.push({ row: row.rowNumber, employeeCode: d.employeeCode, messages: [(err as Error).message] });
      }
    }
    return { successCount: created, failureCount: errors.length, errors, summary: { requestsCreated: created } };
  },

  async rollback(batchId): Promise<void> {
    await prisma.leaveRequest.deleteMany({ where: { importBatchId: batchId } });
  },
};
