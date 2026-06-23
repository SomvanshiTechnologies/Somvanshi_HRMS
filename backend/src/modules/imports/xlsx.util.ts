import * as XLSX from "xlsx";
import type { ImportColumn, ParsedRow, RowError } from "./import.types.js";

/** Normalize a header for tolerant matching (trim, collapse spaces, lowercase). */
function norm(s: unknown): string {
  return String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Parse the first sheet of an uploaded workbook into rows keyed by the importer's
 * canonical column keys. Header matching is case- and whitespace-insensitive, so
 * "Employee Code", "employee code" and " EMPLOYEE  CODE " all map to the same key.
 */
export function parseSheet(buffer: Buffer, columns: ImportColumn[]): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];

  // Array-of-arrays so we control header→key mapping ourselves.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (aoa.length === 0) return [];

  const headerRow = (aoa[0] ?? []).map(norm);
  // Map each canonical column to the source column index (by normalized header + alternates).
  const colIndex = new Map<string, number>();
  for (const col of columns) {
    let idx = headerRow.indexOf(norm(col.header));
    if (idx < 0 && col.altHeaders) {
      for (const alt of col.altHeaders) {
        idx = headerRow.indexOf(norm(alt));
        if (idx >= 0) break;
      }
    }
    if (idx >= 0) colIndex.set(col.key, idx);
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const arr = aoa[i] ?? [];
    // Skip fully-empty rows.
    if (arr.every((c) => String(c ?? "").trim() === "")) continue;
    const cells: Record<string, string> = {};
    for (const col of columns) {
      const idx = colIndex.get(col.key);
      cells[col.key] = idx === undefined ? "" : String(arr[idx] ?? "").trim();
    }
    rows.push({ rowNumber: i + 1, cells }); // +1 → 1-based incl. header row
  }
  return rows;
}

/** Build a downloadable .xlsx template: a data sheet (headers + samples) + an Instructions sheet. */
export function buildTemplate(columns: ImportColumn[], sample: Record<string, string | number>[]): Buffer {
  const headers = columns.map((c) => c.header);
  const dataAoa: (string | number)[][] = [headers];
  for (const row of sample) {
    dataAoa.push(columns.map((c) => (row[c.key] ?? "") as string | number));
  }
  const wb = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet(dataAoa);
  dataSheet["!cols"] = columns.map((c) => ({ wch: Math.max(14, c.header.length + 2) }));
  XLSX.utils.book_append_sheet(wb, dataSheet, "Import");

  const infoAoa: string[][] = [["Column", "Required", "Notes"]];
  for (const c of columns) {
    infoAoa.push([c.header, c.required ? "Yes" : "No", c.note ?? ""]);
  }
  const infoSheet = XLSX.utils.aoa_to_sheet(infoAoa);
  infoSheet["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, infoSheet, "Instructions");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Build an error-report .xlsx from a batch's recorded validation/apply errors. */
export function buildErrorReport(errors: RowError[]): Buffer {
  const aoa: (string | number)[][] = [["Row", "Employee Code", "Errors"]];
  for (const e of errors) {
    aoa.push([e.row, e.employeeCode ?? "", e.messages.join("; ")]);
  }
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [{ wch: 8 }, { wch: 18 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, sheet, "Errors");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
