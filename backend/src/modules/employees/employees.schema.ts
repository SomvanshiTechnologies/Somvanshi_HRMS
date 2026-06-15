import { z } from "zod";
import { PageQuerySchema } from "../../shared/pagination.js";

const GenderEnum = z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]);
const MaritalEnum = z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "UNDISCLOSED"]);
const EmploymentTypeEnum = z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"]);

/**
 * Treat "" / null as "not provided" so an optional enum falls back to its default
 * instead of failing with "Invalid option: expected one of …".
 */
const optionalEnum = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema);
const EmployeeStatusEnum = z.enum([
  "CANDIDATE",
  "ONBOARDING",
  "PROBATION",
  "ACTIVE",
  "RESIGNED",
  "TERMINATED",
  "ALUMNI",
]);

export const EmployeeListQuerySchema = PageQuerySchema.extend({
  status: EmployeeStatusEnum.optional(),
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  locationId: z.string().optional(),
  employmentType: EmploymentTypeEnum.optional(),
  managerId: z.string().optional(),
});

export const CreateEmployeeSchema = z.object({
  /** Custom employee code (e.g. IT-PUN-004). Auto-generated when omitted. */
  employeeCode: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/, "Uppercase letters, digits and dashes")
    .optional(),
  firstName: z.string().min(1).max(80),
  middleName: z.string().max(80).optional().nullable(),
  lastName: z.string().min(1).max(80),
  email: z.email().toLowerCase(),
  personalEmail: z.email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  dateOfBirth: z.coerce.date().optional().nullable(),
  gender: optionalEnum(GenderEnum.default("UNDISCLOSED")),
  maritalStatus: optionalEnum(MaritalEnum.default("UNDISCLOSED")),
  bloodGroup: z.string().max(8).optional().nullable(),
  nationality: z.string().max(60).optional().nullable(),
  currentAddress: z.string().max(1000).optional().nullable(),
  permanentAddress: z.string().max(1000).optional().nullable(),

  status: optionalEnum(EmployeeStatusEnum.default("ONBOARDING")),
  employmentType: optionalEnum(EmploymentTypeEnum.default("FULL_TIME")),
  dateOfJoining: z.coerce.date().optional().nullable(),
  probationEndsAt: z.coerce.date().optional().nullable(),
  confirmedAt: z.coerce.date().optional().nullable(),

  departmentId: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),

  /** When true, also provisions a User login + EMPLOYEE role + welcome email. */
  createLoginAccount: z.boolean().default(true),
});

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial().omit({ createLoginAccount: true });

export const LifecycleTransitionSchema = z.object({
  status: EmployeeStatusEnum,
  effectiveOn: z.coerce.date().default(() => new Date()),
  remarks: z.string().max(500).optional(),
});

export const EducationSchema = z.object({
  degree: z.string().min(2).max(120),
  field: z.string().max(120).optional().nullable(),
  institution: z.string().min(2).max(200),
  startYear: z.number().int().min(1950).max(2100).optional().nullable(),
  endYear: z.number().int().min(1950).max(2100).optional().nullable(),
  grade: z.string().max(40).optional().nullable(),
});

export const ExperienceSchema = z.object({
  companyName: z.string().min(1).max(160),
  title: z.string().min(1).max(120),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export const CertificationSchema = z.object({
  name: z.string().min(2).max(160),
  issuer: z.string().max(160).optional().nullable(),
  issuedOn: z.coerce.date().optional().nullable(),
  expiresOn: z.coerce.date().optional().nullable(),
  credentialId: z.string().max(120).optional().nullable(),
});

export const EmployeeSkillSchema = z.object({
  skillName: z.string().min(1).max(80),
  level: z.number().int().min(1).max(5).default(1),
  yearsOfExp: z.number().min(0).max(60).optional().nullable(),
});

export const BankDetailSchema = z.object({
  accountHolder: z.string().min(2).max(120),
  accountNumber: z.string().min(6).max(34),
  bankName: z.string().min(2).max(120),
  branch: z.string().max(120).optional().nullable(),
  ifsc: z.string().max(20).optional().nullable(),
  isPrimary: z.boolean().default(true),
});

export const EmergencyContactSchema = z.object({
  name: z.string().min(2).max(120),
  relation: z.string().min(2).max(60),
  phone: z.string().min(6).max(20),
  altPhone: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export type EmployeeListQuery = z.infer<typeof EmployeeListQuerySchema>;
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
export type LifecycleTransitionInput = z.infer<typeof LifecycleTransitionSchema>;
