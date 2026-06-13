import { z } from "zod";

const SourceEnum = z.enum(["WEB", "MOBILE", "GPS", "QR"]);

export const PunchSchema = z.object({
  source: SourceEnum.default("WEB"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const MonthQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).default(new Date().getMonth() + 1),
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
});

export const DayQuerySchema = z.object({
  date: z.coerce.date().default(() => new Date()),
  departmentId: z.string().optional(),
});

export const CorrectionRequestSchema = z.object({
  date: z.coerce.date(),
  requestedCheckIn: z.coerce.date().optional(),
  requestedCheckOut: z.coerce.date().optional(),
  reason: z.string().min(5).max(1000),
}).refine((v) => v.requestedCheckIn || v.requestedCheckOut, { message: "Provide at least one corrected time" });

export const CorrectionDecisionSchema = z.object({
  remarks: z.string().max(500).optional(),
});

export const ManualMarkSchema = z.object({
  employeeId: z.string().min(1),
  date: z.coerce.date(),
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "ON_LEAVE", "HOLIDAY", "WEEK_OFF", "WORK_FROM_HOME"]),
  checkInAt: z.coerce.date().optional().nullable(),
  checkOutAt: z.coerce.date().optional().nullable(),
  remarks: z.string().max(500).optional(),
});

export const CreateShiftSchema = z.object({
  name: z.string().min(2).max(60),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm"),
  breakMinutes: z.number().int().min(0).max(240).default(60),
  graceMinutes: z.number().int().min(0).max(120).default(15),
  isNightShift: z.boolean().default(false),
});

export const AssignShiftSchema = z.object({
  employeeId: z.string().min(1),
  shiftId: z.string().min(1),
  effectiveFrom: z.coerce.date().default(() => new Date()),
});

export type PunchInput = z.infer<typeof PunchSchema>;
export type MonthQuery = z.infer<typeof MonthQuerySchema>;
export type DayQuery = z.infer<typeof DayQuerySchema>;
export type CorrectionRequestInput = z.infer<typeof CorrectionRequestSchema>;
export type ManualMarkInput = z.infer<typeof ManualMarkSchema>;
