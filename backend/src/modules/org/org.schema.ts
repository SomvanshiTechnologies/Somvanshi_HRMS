import { z } from "zod";

export const UpsertCompanySchema = z.object({
  name: z.string().min(2).max(160),
  legalName: z.string().max(200).optional().nullable(),
  taxId: z.string().max(64).optional().nullable(),
  website: z.string().max(200).optional().nullable(),
  email: z.email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
});

export const CreateLocationSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  state: z.string().max(80).optional().nullable(),
  country: z.string().max(80).optional().nullable(),
  timezone: z.string().max(64).default("Asia/Kolkata"),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  geoRadius: z.number().int().min(10).max(10000).optional().nullable(),
});
export const UpdateLocationSchema = CreateLocationSchema.partial();

export const CreateDepartmentSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(20).regex(/^[A-Z0-9_-]+$/, "Use uppercase letters/digits"),
  headId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  workingSaturdays: z.array(z.number().int().min(1).max(5)).max(5).optional(), // e.g. [2,4]; [] = all Saturdays off
});
export const UpdateDepartmentSchema = CreateDepartmentSchema.partial().omit({ code: true });

export const CreateDesignationSchema = z.object({
  title: z.string().min(2).max(120),
  level: z.number().int().min(1).max(20).default(1),
  bandId: z.string().optional().nullable(),
});
export const UpdateDesignationSchema = CreateDesignationSchema.partial();

export const CreateBandSchema = z.object({
  name: z.string().min(1).max(40),
  minCtc: z.number().nonnegative().optional().nullable(),
  maxCtc: z.number().nonnegative().optional().nullable(),
});

export type UpsertCompanyInput = z.infer<typeof UpsertCompanySchema>;
export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>;
export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;
export type CreateDesignationInput = z.infer<typeof CreateDesignationSchema>;
export type UpdateDesignationInput = z.infer<typeof UpdateDesignationSchema>;
export type CreateBandInput = z.infer<typeof CreateBandSchema>;
