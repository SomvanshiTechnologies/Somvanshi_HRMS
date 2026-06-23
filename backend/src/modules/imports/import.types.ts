import type { Request } from "express";
import type { PermissionCode } from "../../shared/permissions.js";

/**
 * Reusable Import Engine — shared contracts.
 *
 * Every bulk Excel import in the product (attendance, leave balances/transactions,
 * payslips, and future modules) is implemented as an `Importer`. The engine owns
 * the common flow — parse → validate → preview → commit → history → rollback — and
 * each module only supplies the column map, validation, apply and rollback logic.
 */

/** A single column in the import template / uploaded sheet. */
export interface ImportColumn {
  /** Canonical field key the importer reads (e.g. "employeeCode"). */
  key: string;
  /** Human header shown in the template and matched (case/space-insensitive) in uploads. */
  header: string;
  /** Alternate headers accepted from user uploads (e.g. "Code" for "Employee Code"). */
  altHeaders?: string[];
  required?: boolean;
  /** Example value placed in the downloadable template's sample row. */
  example?: string | number;
  /** Short helper note for the column (shown in the template's Instructions sheet). */
  note?: string;
}

/** One parsed data row, cells keyed by the importer's canonical column keys. */
export interface ParsedRow {
  /** 1-based row number in the source sheet (header is row 1, so first data row = 2). */
  rowNumber: number;
  cells: Record<string, string>;
}

/** A validated row — `data` is the normalized/resolved payload when `errors` is empty. */
export interface ValidatedRow<T = unknown> {
  rowNumber: number;
  data: T | null;
  errors: string[];
  /** Non-blocking notices (e.g. "already exists — will be skipped"). Shown in amber, row still valid. */
  warnings?: string[];
  /** Friendly cells echoed back to the preview table (resolved names etc.). */
  preview: Record<string, unknown>;
}

export interface RowError {
  row: number;
  employeeCode?: string;
  messages: string[];
}

export interface PreviewResult {
  type: string;
  columns: ImportColumn[];
  rows: ValidatedRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  skippedRows: number;
}

export interface CommitResult {
  successCount: number;
  failureCount: number;
  /** Per-row failures that occurred at apply time (validation errors are tracked separately). */
  errors?: RowError[];
  /** Importer-specific roll-up shown in the import history. */
  summary?: Record<string, unknown>;
}

/** Runtime context handed to validate/apply/rollback. */
export interface ImportContext {
  req: Request;
  userId: string;
  userName?: string;
  /** Original filename of the uploaded sheet (used for inferring month, etc.). */
  fileName?: string;
  /** Extra uploaded files keyed by lower-cased original filename (e.g. payslip PDFs). */
  files: Map<string, Express.Multer.File>;
}

export interface Importer<T = unknown> {
  /** Stable type key used in URLs and the ImportBatch.type column. */
  type: string;
  title: string;
  description: string;
  /** Permission a caller must hold to use this importer (Admin/HR-class). */
  permission: PermissionCode;
  columns: ImportColumn[];
  /** Sample rows written into the downloadable template. */
  sample: Record<string, string | number>[];
  /** Whether this importer also accepts attached files (e.g. PDFs) beyond the sheet. */
  acceptsFiles?: boolean;
  validate(rows: ParsedRow[], ctx: ImportContext): Promise<ValidatedRow<T>[]>;
  apply(validRows: ValidatedRow<T>[], batchId: string, ctx: ImportContext): Promise<CommitResult>;
  /** Undo a committed batch (delete what it created). Optional. */
  rollback?(batchId: string, ctx: ImportContext): Promise<void>;
}
