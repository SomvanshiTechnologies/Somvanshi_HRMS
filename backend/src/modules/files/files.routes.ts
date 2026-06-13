import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import express from "express";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { BadRequestError } from "../../core/errors.js";

/**
 * File storage. Dev: local disk under UPLOAD_DIR, served behind auth.
 * Prod (Phase 8): S3-compatible driver behind the same URL contract.
 * Stored names are random — original names live in DB rows that point here.
 */
const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadRoot, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new BadRequestError(`File type ${file.mimetype} is not allowed`));
      return;
    }
    cb(null, true);
  },
});

export function fileUrl(filename: string): string {
  return `${env.API_PREFIX}/files/${filename}`;
}

export const filesRouter: Router = Router();

// generic upload endpoint (field name: "file") → { url, name, size, mimeType }
filesRouter.post("/", requireAuth, upload.single("file"), (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError("No file provided (field name must be 'file')");
  res.status(201).json({
    success: true,
    data: {
      url: fileUrl(req.file.filename),
      name: req.file.originalname,
      sizeBytes: req.file.size,
      mimeType: req.file.mimetype,
    },
  });
});

// authenticated static serving
filesRouter.use(
  "/",
  requireAuth,
  express.static(uploadRoot, { fallthrough: false, index: false, maxAge: "1h" })
);
