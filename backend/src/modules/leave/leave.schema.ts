import { z } from "zod";
import { PageQuerySchema } from "../../shared/pagination.js";

const LeaveUnitEnum = z.enum(["FULL_DAY", "FIRST_HALF", "SECOND_HALF"]);

export const ApplyLeaveSchema = z
  .object({
    leaveTypeId: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    startUnit: LeaveUnitEnum.default("FULL_DAY"),
    endUnit: LeaveUnitEnum.default("FULL_DAY"),
    reason: z.string().min(5, "Give a brief reason").max(1000),
    documentUrl: z.string().max(500).optional().nullable(),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be on or after start date" });

export const EditLeaveSchema = ApplyLeaveSchema;

export const DecideLeaveSchema = z.object({
  remarks: z.string().max(1000).optional(),
});

export const RequestInfoSchema = z.object({
  note: z.string().min(5).max(1000),
});

export const BulkApproveSchema = z.object({
  requestIds: z.array(z.string().min(1)).min(1).max(50),
  remarks: z.string().max(1000).optional(),
});

export const LeaveListQuerySchema = PageQuerySchema.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "WITHDRAWN"]).optional(),
  leaveTypeId: z.string().optional(),
  employeeId: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const CalendarQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).default(new Date().getMonth() + 1),
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
  scope: z.enum(["team", "org"]).default("team"),
});

export const HolidaySchema = z.object({
  name: z.string().min(2).max(120),
  date: z.coerce.date(),
  isOptional: z.boolean().default(false),
});

export const WorkflowStepsSchema = z.object({
  steps: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("MANAGER") }),
        z.object({ type: z.literal("ROLE"), role: z.string().min(2).max(50) }),
      ])
    )
    .min(1)
    .max(5),
});

/* ---- leave policy builder (DB-driven) ---- */

const GenderEnum = z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]);
const WorkflowStepArray = z
  .array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("MANAGER") }),
      z.object({ type: z.literal("ROLE"), role: z.string().min(2).max(50) }),
    ])
  )
  .max(5);

export const LeaveTypeSchema = z.object({
  name: z.string().min(2).max(60),
  code: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  isPaid: z.boolean().default(true),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0A3D62").default("#0A3D62"),
  description: z.string().max(300).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const LeavePolicySchema = z.object({
  leaveTypeId: z.string().min(1),
  name: z.string().min(2).max(80),
  annualQuota: z.number().min(0).max(400).default(0),
  accrualFrequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "NONE"]).default("YEARLY"),
  maxCarryForward: z.number().min(0).max(400).default(0),
  carryForwardExpiryMonths: z.number().int().min(0).max(24).optional().nullable(),
  maxConsecutiveDays: z.number().int().min(0).max(400).optional().nullable(),
  minServiceDays: z.number().int().min(0).max(3650).default(0),
  noticeDays: z.number().int().min(0).max(365).default(0),
  allowHalfDay: z.boolean().default(true),
  requiresDocument: z.boolean().default(false),
  genderRestriction: GenderEnum.optional().nullable(),
  departmentIds: z.array(z.string()).optional().nullable(),
  maxNegativeBalance: z.number().min(0).max(100).default(0),
  encashable: z.boolean().default(false),
  maxEncashmentDays: z.number().min(0).max(400).default(0),
  approvalWorkflow: WorkflowStepArray.optional().nullable(),
  isActive: z.boolean().default(true),
});

export type LeaveTypeInput = z.infer<typeof LeaveTypeSchema>;
export type LeavePolicyInput = z.infer<typeof LeavePolicySchema>;

export type ApplyLeaveInput = z.infer<typeof ApplyLeaveSchema>;
export type LeaveListQuery = z.infer<typeof LeaveListQuerySchema>;
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepsSchema>["steps"][number];
