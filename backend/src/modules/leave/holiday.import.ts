import { prisma } from "../../config/db.js";
import type { CommitResult, ImportColumn, ImportContext, Importer, ParsedRow, RowError, ValidatedRow } from "../imports/import.types.js";
import { PERMISSIONS } from "../../shared/permissions.js";

interface HolidayImportRow {
  name: string;
  date: Date;
  isOptional: boolean;
  calendarId: string;
}

const columns: ImportColumn[] = [
  { key: "name", header: "Holiday Name", altHeaders: ["Name", "Holiday", "Title"], required: true, example: "Republic Day" },
  { key: "date", header: "Date", altHeaders: ["Holiday Date"], required: true, example: "26-Jan-2026", note: "Any common date format (DD-MM-YYYY, YYYY-MM-DD, 26-Jan-2026, etc.)." },
  { key: "isOptional", header: "Optional", altHeaders: ["Is Optional", "Type"], example: "No", note: "Yes/No — optional holidays are not auto-deducted from attendance." },
];

function parseDate(input: string): Date | null {
  if (!input.trim()) return null;
  const d = new Date(input.trim());
  if (!isNaN(d.getTime())) return d;
  const dmyMatch = input.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function parseBool(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "optional";
}

export const holidayImporter: Importer<HolidayImportRow> = {
  type: "holiday",
  title: "Holidays",
  description: "Import company holidays into the holiday calendar.",
  permission: PERMISSIONS.LEAVE_MANAGE,
  columns,
  sample: [
    { name: "Republic Day", date: "26-Jan-2026", optional: "No" },
    { name: "Holi", date: "14-Mar-2026", optional: "No" },
    { name: "Maha Shivaratri", date: "26-Feb-2026", optional: "Yes" },
  ],

  async validate(rows: ParsedRow[], ctx: ImportContext): Promise<ValidatedRow<HolidayImportRow>[]> {
    const yearFromFile = ctx.fileName?.match(/(20\d{2})/)?.[1];
    const defaultYear = yearFromFile ? Number(yearFromFile) : new Date().getFullYear();

    const cal = await prisma.holidayCalendar.findFirst({
      where: { isDefault: true, year: defaultYear },
      select: { id: true },
    });
    const calendarId = cal?.id ?? "";

    const existing = cal
      ? await prisma.holiday.findMany({ where: { calendarId: cal.id }, select: { name: true, date: true } })
      : [];
    const existingKeys = new Set(existing.map((h) => `${h.name.toLowerCase()}|${h.date.toISOString().slice(0, 10)}`));

    return rows.map((row) => {
      const errors: string[] = [];
      const name = (row.cells["name"] ?? "").trim();
      if (!name) errors.push("Holiday Name is required");

      const dateStr = (row.cells["date"] ?? "").trim();
      const date = parseDate(dateStr);
      if (!date) errors.push("Date is required and must be a valid date");

      if (!calendarId) errors.push(`No default holiday calendar found for ${defaultYear}`);

      const isOptional = parseBool(row.cells["isOptional"] ?? "");

      const warnings: string[] = [];
      if (name && date && calendarId) {
        const key = `${name.toLowerCase()}|${date.toISOString().slice(0, 10)}`;
        if (existingKeys.has(key)) warnings.push(`"${name}" on ${date.toISOString().slice(0, 10)} already exists — will be skipped`);
      }

      const data: HolidayImportRow | null =
        errors.length === 0 && !warnings.length && date
          ? { name, date, isOptional, calendarId }
          : null;

      return {
        rowNumber: row.rowNumber,
        data,
        errors,
        warnings,
        preview: {
          name,
          date: date ? date.toISOString().slice(0, 10) : dateStr,
          optional: isOptional ? "Yes" : "No",
        },
      };
    });
  },

  async apply(validRows, batchId): Promise<CommitResult> {
    let created = 0;
    const errors: RowError[] = [];

    for (const row of validRows) {
      const d = row.data!;
      try {
        await prisma.holiday.create({
          data: {
            calendarId: d.calendarId,
            name: d.name,
            date: d.date,
            isOptional: d.isOptional,
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
      summary: { holidaysCreated: created },
    };
  },
};
