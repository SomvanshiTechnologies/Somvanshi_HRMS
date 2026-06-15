import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default("/api/v1"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  // 32-byte key (base64 or hex) for field-level PII encryption. If blank, a key
  // is derived from JWT_ACCESS_SECRET; set a dedicated key in production.
  FIELD_ENCRYPTION_KEY: z.string().optional().default(""),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().default(30),
  ACCOUNT_LOCK_THRESHOLD: z.coerce.number().default(5),
  ACCOUNT_LOCK_MINUTES: z.coerce.number().default(15),
  TWO_FACTOR_ISSUER: z.string().default("SomHR"),

  // Email delivery driver:
  //  "smtp"   — nodemailer SMTP (dev Mailpit, or any relay incl. Resend SMTP)
  //  "ses"    — AWS SES via nodemailer's SES transport
  //  "resend" — Resend HTTP API (uses RESEND_API_KEY)
  MAIL_DRIVER: z.enum(["smtp", "ses", "resend"]).default("smtp"),
  RESEND_API_KEY: z.string().optional().default(""),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  MAIL_FROM: z.string().default("SomHR <no-reply@somvanshitech.com>"),
  // SES region (falls back to AWS_REGION / S3_REGION when blank)
  SES_REGION: z.string().optional().default(""),

  // Shared AWS region + (optional) static credentials. On EC2/ECS these are
  // omitted and the instance/task IAM role is used instead.
  AWS_REGION: z.string().optional().default(""),
  AWS_ACCESS_KEY_ID: z.string().optional().default(""),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(""),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOAD_DIR: z.string().default("../uploads"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("ap-south-1"),
  S3_BUCKET: z.string().optional().default("somhr"),
  S3_KEY_PREFIX: z.string().optional().default(""),
  S3_ACCESS_KEY: z.string().optional().default(""),
  S3_SECRET_KEY: z.string().optional().default(""),

  OPENAI_API_KEY: z.string().optional().default("").transform((s) => s.trim()),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  APP_URL: z.string().default("http://localhost:5173"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
