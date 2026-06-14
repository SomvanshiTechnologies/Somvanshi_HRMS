import { z } from "zod";

/** Fields an employee may change ONLY through the HR-approval workflow. */
export const APPROVAL_FIELDS = [
  "personalEmail",
  "phone",
  "altPhone",
  "currentAddress",
  "permanentAddress",
  "bloodGroup",
  "maritalStatus",
  "dateOfBirth",
] as const;
export type ApprovalField = (typeof APPROVAL_FIELDS)[number];

const FieldValueSchemas: Record<ApprovalField, z.ZodType> = {
  personalEmail: z.email().nullable(),
  phone: z.string().min(6).max(20).nullable(),
  altPhone: z.string().min(6).max(20).nullable(),
  currentAddress: z.string().max(1000).nullable(),
  permanentAddress: z.string().max(1000).nullable(),
  bloodGroup: z.string().max(8).nullable(),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "UNDISCLOSED"]),
  dateOfBirth: z.coerce.date().nullable(),
};

export const CreateChangeRequestSchema = z
  .object({
    changes: z.record(z.string(), z.unknown()).refine((c) => Object.keys(c).length > 0, "No changes provided"),
    isDraft: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    for (const [field, value] of Object.entries(val.changes)) {
      if (!APPROVAL_FIELDS.includes(field as ApprovalField)) {
        ctx.addIssue({ code: "custom", path: ["changes", field], message: `Field '${field}' cannot be changed via self-service` });
        continue;
      }
      const result = FieldValueSchemas[field as ApprovalField].safeParse(value);
      if (!result.success) {
        ctx.addIssue({ code: "custom", path: ["changes", field], message: result.error.issues[0]?.message ?? "Invalid value" });
      }
    }
  });

/** Personal info — applies immediately (self-service, audited). Partial update. */
export const PersonalInfoSchema = z
  .object({
    personalEmail: z.email().nullable(),
    phone: z.string().min(6).max(20).nullable(),
    altPhone: z.string().min(6).max(20).nullable(),
    currentAddress: z.string().max(1000).nullable(),
    permanentAddress: z.string().max(1000).nullable(),
    bloodGroup: z.string().max(8).nullable(),
    maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "UNDISCLOSED"]),
    dateOfBirth: z.coerce.date().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No changes provided");
export type PersonalInfoInput = z.infer<typeof PersonalInfoSchema>;

/** Professional info applies immediately (no approval). */
export const ProfessionalInfoSchema = z.object({
  languages: z.array(z.string().min(1).max(40)).max(20).optional(),
  linkedinUrl: z.url().max(300).optional().nullable(),
  portfolioUrl: z.url().max(300).optional().nullable(),
  careerInterests: z.string().max(2000).optional().nullable(),
});

export const DOCUMENT_CATEGORIES = [
  "AADHAAR", "PAN", "PASSPORT", "DRIVING_LICENSE", "RESUME", "DEGREE", "ADDRESS_PROOF",
  "IDENTITY", "EDUCATION", "EXPERIENCE", "COMPENSATION", "CONTRACT", "POLICY", "LETTER",
  "MEDICAL", "OTHER",
] as const;

export const UploadDocumentSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  name: z.string().min(2).max(160),
  expiresOn: z.coerce.date().optional(),
});

export const ReviewChangeRequestSchema = z.object({
  remarks: z.string().max(1000).optional(),
});

export type CreateChangeRequestInput = z.infer<typeof CreateChangeRequestSchema>;
export type ProfessionalInfoInput = z.infer<typeof ProfessionalInfoSchema>;
