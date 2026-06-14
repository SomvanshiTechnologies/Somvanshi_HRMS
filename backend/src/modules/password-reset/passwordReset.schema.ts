import { z } from "zod";

export const RequestResetSchema = z.object({
  reason: z.string().max(300).optional(),
});

export const ReviewResetSchema = z.object({
  remarks: z.string().max(300).optional(),
});

export type RequestResetInput = z.infer<typeof RequestResetSchema>;
export type ReviewResetInput = z.infer<typeof ReviewResetSchema>;
