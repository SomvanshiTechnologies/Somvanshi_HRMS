import { z } from "zod";

export const LoginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(128),
  deviceFingerprint: z.string().max(128).optional(),
  deviceName: z.string().max(120).optional(),
});

export const TwoFactorLoginSchema = z.object({
  challengeToken: z.string().min(10),
  code: z.string().regex(/^\d{6}$|^[a-f0-9]{10}$/i, "Enter the 6-digit code or a recovery code"),
});

export const ForgotPasswordSchema = z.object({
  email: z.email().toLowerCase(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128)
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a digit"),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: ResetPasswordSchema.shape.password,
});

export const TwoFactorVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type TwoFactorLoginInput = z.infer<typeof TwoFactorLoginSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
