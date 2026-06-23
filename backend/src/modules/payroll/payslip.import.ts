import { prisma } from "../../config/db.js";
import { storeUpload, fileUrl } from "../files/files.routes.js";
import { removeObject } from "../files/storage.js";
import type { CommitResult, ImportColumn, Importer, ParsedRow, RowError, ValidatedRow } from "../imports/import.types.js";
import { PERMISSIONS } from "../../shared/permissions.js";

/**
 * Payslip bulk import — an Excel mapping file (Employee Code, Month, Year, PDF File,
 * optional amounts) plus the matching PDFs attached in the same upload. Each row
 * becomes an IMPORTED, PUBLISHED payslip that shows in the employee portal and
 * payroll history. Single uploads are handled by the payroll module directly.
 */

interface PayslipImportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  month: number;
  year: number;
  pdfFileName: string;
  netPay: number;
  grossEarnings: number;
  totalDeductions: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function parseMonth(v: string): number | null {
  const s = v.trim().toLowerCase();
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 12 ? n : null;
  }
  return MONTHS[s] ?? null;
}

function num(v: string): number {
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const columns: ImportColumn[] = [
  { key: "employeeCode", header: "Employee Code", required: true, example: "EMP001", note: "Must match an existing employee code." },
  { key: "month", header: "Month", required: true, example: "Jan", note: "Month name or number (1-12)." },
  { key: "year", header: "Year", required: true, example: 2025, note: "4-digit year." },
  { key: "pdfFile", header: "PDF File", required: true, example: "emp001_jan2025.pdf", note: "Exact file name of an attached PDF." },
  { key: "netPay", header: "Net Pay", example: 45000, note: "Optional — shown in the portal. Defaults to 0." },
  { key: "grossEarnings", header: "Gross Earnings", example: 52000, note: "Optional." },
  { key: "totalDeductions", header: "Deductions", example: 7000, note: "Optional." },
];

export const payslipImporter: Importer<PayslipImportRow> = {
  type: "payslip",
  title: "Payslips (bulk PDF)",
  description: "Import historical payslip PDFs from before the HRMS, mapped by employee, month and year.",
  permission: PERMISSIONS.PAYROLL_MANAGE,
  acceptsFiles: true,
  columns,
  sample: [
    { employeeCode: "EMP001", month: "Jan", year: 2025, pdfFile: "emp001_jan2025.pdf", netPay: 45000, grossEarnings: 52000, totalDeductions: 7000 },
    { employeeCode: "EMP002", month: "Jan", year: 2025, pdfFile: "emp002_jan2025.pdf", netPay: 38000, grossEarnings: 44000, totalDeductions: 6000 },
  ],

  async validate(rows: ParsedRow[], ctx): Promise<ValidatedRow<PayslipImportRow>[]> {
    const codes = [...new Set(rows.map((r) => r.cells["employeeCode"]?.trim()).filter((c): c is string => !!c))];
    const employees = await prisma.employee.findMany({
      where: { employeeCode: { in: codes }, deletedAt: null },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
    const byCode = new Map(employees.map((e) => [e.employeeCode, e]));
    const attached = ctx.files; // lower-cased original name → file

    // Detect existing payslips to flag duplicates.
    const existing = await prisma.payslip.findMany({
      where: { employee: { employeeCode: { in: codes } } },
      select: { month: true, year: true, employee: { select: { employeeCode: true } } },
    });
    const existingKey = new Set(existing.map((p) => `${p.employee.employeeCode}|${p.month}|${p.year}`));

    return rows.map((row) => {
      const errors: string[] = [];
      const code = (row.cells["employeeCode"] ?? "").trim();
      const emp = code ? byCode.get(code) : undefined;
      if (!code) errors.push("Employee Code is required");
      else if (!emp) errors.push(`No employee with code "${code}"`);

      const month = parseMonth(row.cells["month"] ?? "");
      if (!month) errors.push("Month must be a name (Jan) or number (1-12)");
      const year = Number((row.cells["year"] ?? "").trim());
      if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push("Year must be a 4-digit year");

      const pdfName = (row.cells["pdfFile"] ?? "").trim();
      if (!pdfName) errors.push("PDF File is required");
      else if (!attached.has(pdfName.toLowerCase())) errors.push(`No attached PDF named "${pdfName}"`);

      if (emp && month && year && !errors.length && existingKey.has(`${code}|${month}|${year}`)) {
        errors.push(`A payslip for ${code} ${month}/${year} already exists`);
      }

      const data: PayslipImportRow | null =
        errors.length === 0 && emp && month
          ? {
              employeeId: emp.id,
              employeeCode: code,
              employeeName: `${emp.firstName} ${emp.lastName}`,
              month,
              year,
              pdfFileName: pdfName,
              netPay: num(row.cells["netPay"] ?? ""),
              grossEarnings: num(row.cells["grossEarnings"] ?? ""),
              totalDeductions: num(row.cells["totalDeductions"] ?? ""),
            }
          : null;

      return {
        rowNumber: row.rowNumber,
        data,
        errors,
        preview: {
          employeeCode: code,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
          month: month ? `${String(month).padStart(2, "0")}/${year || "?"}` : (row.cells["month"] ?? ""),
          pdfFile: pdfName,
          netPay: row.cells["netPay"] ?? "",
        },
      };
    });
  },

  async apply(validRows, batchId, ctx): Promise<CommitResult> {
    const errors: RowError[] = [];
    let created = 0;

    for (const row of validRows) {
      const d = row.data!;
      const file = ctx.files.get(d.pdfFileName.toLowerCase());
      if (!file) {
        errors.push({ row: row.rowNumber, employeeCode: d.employeeCode, messages: [`Attached PDF "${d.pdfFileName}" missing at import time`] });
        continue;
      }
      try {
        const stored = await storeUpload(file);
        await prisma.payslip.create({
          data: {
            employeeId: d.employeeId,
            month: d.month,
            year: d.year,
            workingDays: 0,
            paidDays: 0,
            grossEarnings: d.grossEarnings,
            totalDeductions: d.totalDeductions,
            netPay: d.netPay,
            status: "PUBLISHED",
            source: "IMPORTED",
            publishedAt: new Date(),
            pdfUrl: fileUrl(stored),
            sourceFileName: d.pdfFileName,
            importBatchId: batchId,
          },
        });
        created += 1;
      } catch (err) {
        errors.push({ row: row.rowNumber, employeeCode: d.employeeCode, messages: [(err as Error).message] });
      }
    }

    return {
      successCount: created,
      failureCount: errors.length,
      errors,
      summary: { payslipsCreated: created },
    };
  },

  async rollback(batchId): Promise<void> {
    const slips = await prisma.payslip.findMany({ where: { importBatchId: batchId }, select: { id: true, pdfUrl: true } });
    await prisma.payslip.deleteMany({ where: { importBatchId: batchId } });
    // Best-effort: remove the stored PDFs too.
    for (const s of slips) {
      const name = s.pdfUrl?.split("/").pop();
      if (name) await removeObject(name);
    }
  },
};
