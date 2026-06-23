import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import path from "node:path";
import { importService } from "./import.service.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { resolvePermissions } from "../../middleware/rbac.middleware.js";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "../../core/errors.js";
import { ok, created } from "../../core/http.js";
import { XLSX_MIME } from "./xlsx.util.js";

/**
 * Reusable Import Engine routes.
 *   GET  /imports/:type/template   → download .xlsx template
 *   POST /imports/:type/preview    → upload + validate (no commit), returns preview
 *   POST /imports/:type/commit     → upload + apply valid rows, creates a batch
 *   GET  /imports                  → history (scoped to caller's allowed types)
 *   GET  /imports/:id              → one batch
 *   GET  /imports/:id/errors       → error-report .xlsx
 *   POST /imports/:id/rollback     → undo a committed batch
 */
export const importsRouter: Router = Router();
importsRouter.use(requireAuth);

const ALLOWED_SHEET_EXT = new Set([".xlsx", ".xls", ".csv"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 200 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === "file") {
      if (!ALLOWED_SHEET_EXT.has(ext)) {
        cb(new BadRequestError("Upload an .xlsx, .xls or .csv file"));
        return;
      }
    } else if (file.fieldname === "pdfs") {
      if (ext !== ".pdf") {
        cb(new BadRequestError(`Attachments must be PDFs (got ${file.originalname})`));
        return;
      }
    }
    cb(null, true);
  },
});

// Accept the sheet ("file") plus optional attached PDFs ("pdfs") in one request,
// so the same endpoints serve simple imports and payslip-bulk (sheet + PDFs).
const uploadFields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "pdfs", maxCount: 200 },
]);

/** Guard: the caller must hold the importer's required permission. */
function requireImportPermission(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const type = req.params["type"] as string;
      const permission = importService.permissionFor(type);
      if (!permission) throw new BadRequestError("Unknown import type");
      const perms = await resolvePermissions(req.user.id);
      if (!perms.has(permission)) throw new ForbiddenError("You do not have permission to run this import");
      next();
    } catch (err) {
      next(err);
    }
  })();
}

function filesFrom(req: Request): { sheet: Express.Multer.File; pdfs: Map<string, Express.Multer.File> } {
  const grouped = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const sheet = grouped["file"]?.[0];
  if (!sheet) throw new BadRequestError("No file provided (field name must be 'file')");
  const pdfs = new Map<string, Express.Multer.File>();
  for (const f of grouped["pdfs"] ?? []) pdfs.set(f.originalname.toLowerCase(), f);
  return { sheet, pdfs };
}

importsRouter.get(
  "/:type/template",
  requireImportPermission,
  asyncHandler(async (req: Request, res: Response) => {
    const { buffer, fileName } = importService.template(req.params["type"] as string);
    res
      .header("Content-Type", XLSX_MIME)
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(buffer);
  })
);

importsRouter.post(
  "/:type/preview",
  requireImportPermission,
  uploadFields,
  asyncHandler(async (req: Request, res: Response) => {
    const { sheet, pdfs } = filesFrom(req);
    ok(res, await importService.preview(req.params["type"] as string, sheet, pdfs, req));
  })
);

importsRouter.post(
  "/:type/commit",
  requireImportPermission,
  uploadFields,
  asyncHandler(async (req: Request, res: Response) => {
    const { sheet, pdfs } = filesFrom(req);
    created(res, await importService.commit(req.params["type"] as string, sheet, pdfs, req), "Import complete.");
  })
);

importsRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await importService.history(req, (req.query["type"] as string) || undefined));
  })
);

importsRouter.get(
  "/:id/errors",
  asyncHandler(async (req: Request, res: Response) => {
    const { buffer, fileName } = await importService.errorReport(req.params["id"] as string, req);
    res
      .header("Content-Type", XLSX_MIME)
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .send(buffer);
  })
);

importsRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const batch = await importService.getBatch(req.params["id"] as string);
    await importService.assertCanAccess(req, batch.type);
    ok(res, batch);
  })
);

importsRouter.post(
  "/:id/rollback",
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await importService.rollback(req.params["id"] as string, req), "Import rolled back.");
  })
);
