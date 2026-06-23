import { z } from "zod";

const ComponentTypeEnum = z.enum(["EARNING", "DEDUCTION", "EMPLOYER_CONTRIBUTION"]);
const CalcTypeEnum = z.enum(["FLAT", "PERCENT_OF_BASIC", "PERCENT_OF_CTC", "FORMULA"]);
const PaymentStatusEnum = z.enum(["PENDING", "INITIATED", "PAID", "FAILED"]);
const PayslipStatusEnum = z.enum(["GENERATED", "PUBLISHED", "ON_HOLD"]);

export const PayslipLineInputSchema = z.object({
  componentId: z.string().min(1),
  type: ComponentTypeEnum,
  label: z.string().min(1).max(80),
  amount: z.number().min(0),
  displayOrder: z.number().int().optional(),
});

/** Edit an existing payslip (all fields optional; lines replace the set when given). */
export const PayslipEditSchema = z.object({
  workingDays: z.number().min(0).max(31).optional(),
  paidDays: z.number().min(0).max(31).optional(),
  lopDays: z.number().min(0).max(31).optional(),
  holidays: z.number().min(0).max(31).optional(),
  weekOffs: z.number().min(0).max(31).optional(),
  overtimeHours: z.number().min(0).max(744).optional(),
  transactionId: z.string().max(120).nullable().optional(),
  paymentRef: z.string().max(120).nullable().optional(),
  paymentDate: z.coerce.date().nullable().optional(),
  bankName: z.string().max(120).nullable().optional(),
  paymentStatus: PaymentStatusEnum.optional(),
  remarks: z.string().max(2000).nullable().optional(),
  payrollNotes: z.string().max(2000).nullable().optional(),
  hrNotes: z.string().max(2000).nullable().optional(),
  status: PayslipStatusEnum.optional(),
  lines: z.array(PayslipLineInputSchema).max(60).optional(),
});

/** Manually add a single historical payslip. */
export const ManualPayslipSchema = z.object({
  employeeId: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  workingDays: z.number().min(0).max(31).optional(),
  paidDays: z.number().min(0).max(31).optional(),
  lopDays: z.number().min(0).max(31).optional(),
  holidays: z.number().min(0).max(31).optional(),
  weekOffs: z.number().min(0).max(31).optional(),
  overtimeHours: z.number().min(0).max(744).optional(),
  grossEarnings: z.number().min(0).optional(),
  totalDeductions: z.number().min(0).optional(),
  netPay: z.number().min(0).optional(),
  transactionId: z.string().max(120).nullable().optional(),
  paymentRef: z.string().max(120).nullable().optional(),
  paymentDate: z.coerce.date().nullable().optional(),
  bankName: z.string().max(120).nullable().optional(),
  paymentStatus: PaymentStatusEnum.optional(),
  remarks: z.string().max(2000).nullable().optional(),
});

export const ComponentSchema = z.object({
  name: z.string().min(2).max(60),
  code: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
  type: ComponentTypeEnum,
  calculationType: CalcTypeEnum.default("FLAT"),
  percentValue: z.number().min(0).max(100).nullable().optional(),
  formula: z.string().max(200).nullable().optional(),
  isTaxable: z.boolean().default(true),
  isStatutory: z.boolean().default(false),
  isReimbursement: z.boolean().default(false),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(1).max(99).default(1),
});

export const StructureSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
  componentIds: z.array(z.string()).optional(),
});

export const StatutoryConfigSchema = z.object({
  flatStructure: z.boolean().optional(),
  basicPercentOfCtc: z.number().min(0).max(100).optional(),
  hraPercentOfBasic: z.number().min(0).max(100).optional(),
  statutoryEnabled: z.boolean().optional(),
  pfEnabled: z.boolean().optional(),
  pfRate: z.number().min(0).max(100).optional(),
  pfWageCap: z.number().min(0).optional(),
  esiEnabled: z.boolean().optional(),
  esiRate: z.number().min(0).max(100).optional(),
  esiGrossThreshold: z.number().min(0).optional(),
  ptEnabled: z.boolean().optional(),
  ptAmount: z.number().min(0).optional(),
  ptGrossThreshold: z.number().min(0).optional(),
  tdsEnabled: z.boolean().optional(),
  tdsStandardDeduction: z.number().min(0).optional(),
  tdsRebateLimit: z.number().min(0).optional(),
  tdsCessRate: z.number().min(0).max(100).optional(),
  tdsSlabs: z.array(z.tuple([z.number(), z.number(), z.number()])).nullable().optional(),
});

export type PayslipEditInput = z.infer<typeof PayslipEditSchema>;
export type ManualPayslipInput = z.infer<typeof ManualPayslipSchema>;
