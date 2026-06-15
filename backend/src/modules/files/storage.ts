// Storage abstraction — local disk (dev / single EC2) or AWS S3 (production).
// The public URL contract is identical for both drivers: every stored object is
// addressed as `${API_PREFIX}/files/<filename>` and streamed back through the
// authenticated /files route, so DB rows are portable across drivers and the
// frontend never talks to S3 directly (keeps the auth gate intact).
import path from "node:path";
import fs from "node:fs";
import { env } from "../../config/env.js";
import { logger } from "../../core/logger.js";

export const isS3 = env.STORAGE_DRIVER === "s3";

const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
if (!isS3) fs.mkdirSync(uploadRoot, { recursive: true });

// Optional key prefix so a shared bucket can host multiple environments.
const KEY_PREFIX = (env.S3_KEY_PREFIX ?? "").replace(/^\/+|\/+$/g, "");
const keyFor = (filename: string): string => (KEY_PREFIX ? `${KEY_PREFIX}/${filename}` : filename);

// ── lazy S3 client (only imported when STORAGE_DRIVER=s3) ──
type S3ClientT = import("@aws-sdk/client-s3").S3Client;
let s3: S3ClientT | null = null;
async function client(): Promise<S3ClientT> {
  if (!s3) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const accessKeyId = env.S3_ACCESS_KEY || env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = env.S3_SECRET_KEY || env.AWS_SECRET_ACCESS_KEY;
    s3 = new S3Client({
      region: env.S3_REGION || env.AWS_REGION || "ap-south-1",
      // custom endpoint (e.g. MinIO / R2) → path-style addressing
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
      // explicit keys are optional — on EC2/ECS the instance role is used instead
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }
  return s3;
}

/** Persist an uploaded object. `filename` is the random stored name (with ext). */
export async function putObject(filename: string, body: Buffer, contentType: string): Promise<void> {
  if (isS3) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await client()).send(
      new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: keyFor(filename), Body: body, ContentType: contentType })
    );
  } else {
    fs.writeFileSync(path.join(uploadRoot, filename), body);
  }
}

/** Fetch a stored object's bytes, or null if it does not exist. */
export async function getObject(filename: string): Promise<Buffer | null> {
  if (isS3) {
    try {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const res = await (await client()).send(
        new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: keyFor(filename) })
      );
      const bytes = await (res.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      logger.warn({ filename, err: (err as Error).message }, "S3 getObject failed");
      return null;
    }
  }
  const p = path.join(uploadRoot, filename);
  try {
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  } catch {
    return null;
  }
}

/** Delete a stored object (best-effort). */
export async function removeObject(filename: string): Promise<void> {
  if (isS3) {
    try {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await (await client()).send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: keyFor(filename) }));
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    fs.rmSync(path.join(uploadRoot, filename), { force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Resolve a stored asset URL (e.g. "/api/v1/files/x.png") to its bytes — used by
 * the PDF generators for logos / signatures / stamps. Works for both drivers.
 */
export async function assetBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  const name = url.split("/").pop();
  if (!name) return null;
  return getObject(name);
}

/** Read a project-bundled asset (e.g. assets/logo_STech.jpg) from disk. */
export function bundledAsset(absPath: string): Buffer | null {
  try {
    return fs.existsSync(absPath) ? fs.readFileSync(absPath) : null;
  } catch {
    return null;
  }
}

/** Best-effort content-type from a stored filename's extension. */
export function contentTypeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream";
  }
}
