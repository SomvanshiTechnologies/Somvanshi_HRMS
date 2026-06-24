import { prisma } from "../../config/db.js";
import type { CommitResult, ImportColumn, ImportContext, Importer, ParsedRow, RowError, ValidatedRow } from "../imports/import.types.js";
import { PERMISSIONS } from "../../shared/permissions.js";

interface LeaveTypeImportRow {
  name: string;
  code: string;
  isPaid: boolean;
  annualQuota: number;
  accrualFrequency: string;
  maxCarryForward: number;
  noticeDays: number;
  requiresDocument: boolean;
  genderRestriction: string | null;
  maxConsecutiveDays: number | null;
  colorHex: string;
  description: string | null;
}

const columns: ImportColumn[] = [
  { key: "name", header: "Leave Type", altHeaders: ["Name", "Type Name"], required: true, example: "Casual Leave" },
  { key: "code", header: "Code", altHeaders: ["Leave Code", "Type Code"], required: true, example: "CL", note: "Unique short code (2-5 chars)." },
  { key: "isPaid", header: "Paid", altHeaders: ["Is Paid"], example: "Yes", note: "Yes/No" },
  { key: "annualQuota", header: "Annual Quota", altHeaders: ["Quota", "Days", "Annual Days"], required: true, example: 12, note: "Total days per year (0 for unlimited/approval-based)." },
  { key: "accrualFrequency", header: "Accrual", altHeaders: ["Accrual Frequency"], example: "Monthly", note: "Monthly, Yearly, Quarterly, or None." },
  { key: "maxCarryForward", header: "Carry Forward", altHeaders: ["Max Carry Forward", "CF Days"], example: 0, note: "Max days carried to next year." },
  { key: "noticeDays", header: "Notice Days", altHeaders: ["Notice Period"], example: 0 },
  { key: "requiresDocument", header: "Document Required", altHeaders: ["Requires Document", "Doc Required"], example: "No", note: "Yes/No" },
  { key: "genderRestriction", header: "Gender", altHeaders: ["Gender Restriction", "Applies To"], example: "Everyone", note: "Everyone, Male, or Female." },
  { key: "maxConsecutiveDays", header: "Max Consecutive Days", altHeaders: ["Max Days"], example: "", note: "Leave blank for no limit." },
  { key: "colorHex", header: "Color", altHeaders: ["Colour", "Color Hex"], example: "#2e86ab", note: "Hex color code for calendar display." },
  { key: "description", header: "Description", altHeaders: ["Notes"], example: "For personal/urgent matters" },
];

const ACCRUAL_MAP: Record<string, string> = {
  monthly: "MONTHLY", yearly: "YEARLY", quarterly: "QUARTERLY", none: "NONE",
  "": "YEARLY",
};

function parseBool(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1";
}

function numOrZero(v: string): number {
  const n = Number(v.trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export const leaveTypeImporter: Importer<LeaveTypeImportRow> = {
  type: "leave_type",
  title: "Leave Types & Policies",
  description: "Import leave types with their policy rules (quota, accrual, carry-forward, restrictions).",
  permission: PERMISSIONS.LEAVE_MANAGE,
  columns,
  sample: [
    { name: "Casual Leave", code: "CL", paid: "Yes", annualQuota: 12, accrual: "Monthly", carryForward: 0, noticeDays: 0, documentRequired: "No", gender: "Everyone", maxConsecutiveDays: "", color: "#2e86ab", description: "For personal/urgent matters" },
    { name: "Maternity Leave", code: "ML", paid: "Yes", annualQuota: 182, accrual: "None", carryForward: 0, noticeDays: 0, documentRequired: "Yes", gender: "Female", maxConsecutiveDays: "", color: "#8b5cf6", description: "As per Maternity Benefit Act" },
  ],

  async validate(rows: ParsedRow[], _ctx: ImportContext): Promise<ValidatedRow<LeaveTypeImportRow>[]> {
    const existingCodes = new Set(
      (await prisma.leaveType.findMany({ select: { code: true } })).map((t) => t.code.toUpperCase())
    );

    return rows.map((row) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      const name = (row.cells["name"] ?? "").trim();
      if (!name) errors.push("Leave Type name is required");

      const code = (row.cells["code"] ?? "").trim().toUpperCase();
      if (!code) errors.push("Code is required");
      else if (code.length > 10) errors.push("Code must be 10 characters or less");

      if (code && existingCodes.has(code)) {
        warnings.push(`Leave type "${code}" already exists — will be skipped`);
      }

      const annualQuota = numOrZero(row.cells["annualQuota"] ?? "0");
      const accrualRaw = (row.cells["accrualFrequency"] ?? "").trim().toLowerCase();
      const accrualFrequency = ACCRUAL_MAP[accrualRaw];
      if (!accrualFrequency) errors.push(`Accrual must be Monthly, Yearly, Quarterly, or None (got "${row.cells["accrualFrequency"]}")`);

      const isPaid = parseBool(row.cells["isPaid"] ?? "yes");
      const maxCarryForward = numOrZero(row.cells["maxCarryForward"] ?? "0");
      const noticeDays = numOrZero(row.cells["noticeDays"] ?? "0");
      const requiresDocument = parseBool(row.cells["requiresDocument"] ?? "no");

      const genderRaw = (row.cells["genderRestriction"] ?? "").trim().toLowerCase();
      const genderRestriction = genderRaw === "female" ? "FEMALE" : genderRaw === "male" ? "MALE" : null;

      const maxConsRaw = (row.cells["maxConsecutiveDays"] ?? "").trim();
      const maxConsecutiveDays = maxConsRaw ? numOrZero(maxConsRaw) || null : null;

      let colorHex = (row.cells["colorHex"] ?? "").trim();
      if (!colorHex || !/^#[0-9a-fA-F]{6}$/.test(colorHex)) colorHex = "#2e86ab";

      const description = (row.cells["description"] ?? "").trim() || null;

      const data: LeaveTypeImportRow | null =
        errors.length === 0 && !warnings.length
          ? { name, code, isPaid, annualQuota, accrualFrequency: accrualFrequency!, maxCarryForward, noticeDays, requiresDocument, genderRestriction, maxConsecutiveDays, colorHex, description }
          : null;

      return {
        rowNumber: row.rowNumber,
        data,
        errors,
        warnings,
        preview: {
          name,
          code,
          annualQuota: `${annualQuota} days`,
          accrual: accrualFrequency ?? accrualRaw,
          gender: genderRestriction ?? "Everyone",
          paid: isPaid ? "Yes" : "No",
        },
      };
    });
  },

  async apply(validRows, _batchId): Promise<CommitResult> {
    let created = 0;
    const errors: RowError[] = [];

    for (const row of validRows) {
      const d = row.data!;
      try {
        const type = await prisma.leaveType.create({
          data: { name: d.name, code: d.code, isPaid: d.isPaid, colorHex: d.colorHex, description: d.description },
        });
        await prisma.leavePolicy.create({
          data: {
            leaveTypeId: type.id,
            name: `${d.name} — Standard`,
            annualQuota: d.annualQuota,
            accrualFrequency: d.accrualFrequency as "MONTHLY" | "YEARLY" | "QUARTERLY" | "NONE",
            maxCarryForward: d.maxCarryForward,
            noticeDays: d.noticeDays,
            requiresDocument: d.requiresDocument,
            genderRestriction: d.genderRestriction as "MALE" | "FEMALE" | null,
            maxConsecutiveDays: d.maxConsecutiveDays,
          },
        });
        created++;
      } catch (err) {
        errors.push({ row: row.rowNumber, messages: [(err as Error).message] });
      }
    }

    return {
      successCount: created,
      failureCount: errors.length,
      errors,
      summary: { leaveTypesCreated: created },
    };
  },
};
