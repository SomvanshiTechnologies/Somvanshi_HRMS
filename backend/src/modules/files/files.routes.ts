import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { BadRequestError, NotFoundError } from "../../core/errors.js";
import { isS3, putObject, getObject, contentTypeFor } from "./storage.js";

/**
 * File storage. Local disk under UPLOAD_DIR (dev / single EC2) or AWS S3 (prod),
 * selected by STORAGE_DRIVER. Either way the URL contract is the same:
 *   POST /api/v1/files            → { url: "/api/v1/files/<name>", ... }
 *   GET  /api/v1/files/<name>     → the bytes, behind auth
 * Stored names are random — original names live in DB rows that point here.
 */
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Buffer the upload in memory, then hand the bytes to the active storage driver.
// (8 MB cap — same as before.)
const upload_ = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new BadRequestError(`File type ${file.mimetype} is not allowed`));
      return;
    }
    cb(null, true);
  },
});

export const upload = upload_;

export function fileUrl(filename: string): string {
  return `${env.API_PREFIX}/files/${filename}`;
}

/**
 * Persist a buffered multer upload to the active storage driver and return the
 * generated stored filename. Use after `upload.single(...)` in any route, since
 * the shared `upload` middleware now buffers in memory (no disk `.filename`).
 */
export async function storeUpload(file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
  const filename = `${crypto.randomUUID()}${ext}`;
  await putObject(filename, file.buffer, file.mimetype);
  return filename;
}

export const filesRouter: Router = Router();

// generic upload endpoint (field name: "file") → { url, name, size, mimeType }
filesRouter.post("/", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError("No file provided (field name must be 'file')");
  const filename = await storeUpload(req.file);
  res.status(201).json({
    success: true,
    data: {
      url: fileUrl(filename),
      name: req.file.originalname,
      sizeBytes: req.file.size,
      mimeType: req.file.mimetype,
    },
  });
});

// authenticated download — streams the bytes from disk or S3 through the backend
// so the auth gate applies regardless of driver.
filesRouter.get("/:name", requireAuth, async (req: Request, res: Response) => {
  const name = path.basename(req.params["name"] as string); // guard against path traversal
  const bytes = await getObject(name);
  if (!bytes) throw new NotFoundError("File not found");
  res.setHeader("Content-Type", contentTypeFor(name));
  res.setHeader("Cache-Control", `private, max-age=${isS3 ? 86400 : 3600}`);
  res.send(bytes);
});
