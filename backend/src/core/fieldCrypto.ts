// Field-level encryption for PII stored at rest (statutory IDs, bank account no).
// AES-256-GCM (authenticated encryption). Encrypted values carry a recognizable
// prefix so a legacy plaintext value is detected and passed through unchanged on
// read — this keeps reads working during/after the first encryption rollout.
//
// Key: env.FIELD_ENCRYPTION_KEY (32 bytes as base64 or hex). If unset, a key is
// derived deterministically from JWT_ACCESS_SECRET via scrypt so the feature
// works out of the box; production should set a dedicated key (see ENVIRONMENT.md).
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

const PREFIX = "enc:v1:";

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = env.FIELD_ENCRYPTION_KEY?.trim();
  if (raw) {
    const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length !== 32) {
      throw new Error("FIELD_ENCRYPTION_KEY must decode to 32 bytes (generate: openssl rand -base64 32)");
    }
    cachedKey = buf;
  } else {
    // deterministic fallback derived from the JWT access secret
    cachedKey = crypto.scryptSync(env.JWT_ACCESS_SECRET, "somhr.field-crypto.v1", 32);
  }
  return cachedKey;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Encrypt a plaintext string → "enc:v1:<base64(iv|tag|ciphertext)>". */
export function encryptField(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Decrypt a stored value. Passes through values that aren't in encrypted form. */
export function decryptField(stored: string): string {
  if (!isEncrypted(stored)) return stored; // legacy plaintext
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Decrypt that never throws — on failure returns the raw stored value and logs. */
export function decryptSafe(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  try {
    return decryptField(stored);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "field decryption failed — returning stored value");
    return stored;
  }
}

/** Encrypt a value unless it's null/empty (returns null for empty). */
export function encryptMaybe(value: string | null | undefined): string | null {
  return value == null || value === "" ? null : encryptField(value);
}

// ── EmployeeStatutory PII helpers ────────────────────────────────────────────
// All identifier strings on the statutory record are encrypted at rest.
export const STATUTORY_PII_FIELDS = [
  "aadhaarNumber",
  "panNumber",
  "uanNumber",
  "pfNumber",
  "esicNumber",
  "nationalId",
] as const;

/** Encrypt every PII field present in a (partial) statutory write payload. */
export function encryptStatutoryInput<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = { ...data };
  for (const f of STATUTORY_PII_FIELDS) {
    if (f in out) {
      const v = out[f];
      out[f] = typeof v === "string" && v !== "" ? encryptField(v) : v === "" ? null : v;
    }
  }
  return out as T;
}

/** Decrypt every PII field on a statutory record (safe). Returns null for null. */
export function decryptStatutoryRecord<T extends Record<string, unknown>>(rec: T | null): T | null {
  if (!rec) return rec;
  const out: Record<string, unknown> = { ...rec };
  for (const f of STATUTORY_PII_FIELDS) {
    if (typeof out[f] === "string") out[f] = decryptSafe(out[f] as string);
  }
  return out as T;
}
