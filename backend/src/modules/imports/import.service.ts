import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { resolvePermissions } from "../../middleware/rbac.middleware.js";
import { getImporter, listImporters } from "./import.registry.js";
import { parseSheet, buildTemplate, buildErrorReport } from "./xlsx.util.js";
import type { CommitResult, ImportContext, PreviewResult, RowError } from "./import.types.js";

function contextFrom(req: Request, files: Map<string, Express.Multer.File>, fileName?: string): ImportContext {
  return {
    req,
    userId: req.user!.id,
    fileName,
    files,
  };
}

/** Best-effort display name for the importer (for history rows). */
async function resolveUserName(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, employee: { select: { firstName: true, lastName: true } } },
  });
  if (!user) return null;
  if (user.employee) return `${user.employee.firstName} ${user.employee.lastName}`.trim();
  return user.email;
}

export const importService = {
  /** The downloadable .xlsx template for a given importer. */
  template(type: string): { buffer: Buffer; fileName: string } {
    const importer = getImporter(type);
    if (!importer) throw new NotFoundError("Import type");
    return {
      buffer: buildTemplate(importer.columns, importer.sample),
      fileName: `somhr-${type}-import-template.xlsx`,
    };
  },

  /** Parse + validate the uploaded sheet, returning a preview WITHOUT persisting anything. */
  async preview(
    type: string,
    file: Express.Multer.File,
    extraFiles: Map<string, Express.Multer.File>,
    req: Request
  ): Promise<PreviewResult> {
    const importer = getImporter(type);
    if (!importer) throw new NotFoundError("Import type");

    const parsed = parseSheet(file.buffer, importer.columns);
    if (parsed.length === 0) throw new BadRequestError("The sheet has no data rows. Use the template and try again.");

    const rows = await importer.validate(parsed, contextFrom(req, extraFiles, file.originalname));
    const validRows = rows.filter((r) => r.errors.length === 0 && !(r.warnings?.length)).length;
    const skippedRows = rows.filter((r) => r.errors.length === 0 && (r.warnings?.length ?? 0) > 0).length;
    return {
      type,
      columns: importer.columns,
      rows,
      totalRows: rows.length,
      validRows,
      invalidRows: rows.length - validRows - skippedRows,
      skippedRows,
    };
  },

  /**
   * Re-validate (authoritative) and apply the valid rows. Invalid rows are recorded
   * as errors on the batch but never block the valid ones. Creates an ImportBatch
   * (history + audit + rollback handle).
   */
  async commit(
    type: string,
    file: Express.Multer.File,
    extraFiles: Map<string, Express.Multer.File>,
    req: Request
  ) {
    const importer = getImporter(type);
    if (!importer) throw new NotFoundError("Import type");

    const ctx = contextFrom(req, extraFiles, file.originalname);
    const parsed = parseSheet(file.buffer, importer.columns);
    if (parsed.length === 0) throw new BadRequestError("The sheet has no data rows. Use the template and try again.");

    const validated = await importer.validate(parsed, ctx);
    const valid = validated.filter((r) => r.errors.length === 0 && !(r.warnings?.length));
    const skipped = validated.filter((r) => r.errors.length === 0 && (r.warnings?.length ?? 0) > 0);
    const invalid = validated.filter((r) => r.errors.length > 0);

    // Create the batch up front so apply() can tag rows with its id.
    const batch = await prisma.importBatch.create({
      data: {
        type,
        fileName: file.originalname,
        status: "COMPLETED",
        totalRows: validated.length,
        importedBy: ctx.userId,
        importedByName: await resolveUserName(ctx.userId),
      },
    });

    let result: CommitResult = { successCount: 0, failureCount: 0 };
    try {
      result = valid.length > 0 ? await importer.apply(valid, batch.id, ctx) : { successCount: 0, failureCount: 0 };
    } catch (err) {
      // A catastrophic apply failure → mark the whole batch FAILED, surface the message.
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { status: "FAILED", failureCount: validated.length, errors: [{ row: 0, messages: [(err as Error).message] }] as object },
      });
      audit({ action: "import.failed", entity: "ImportBatch", entityId: batch.id, after: { type, error: (err as Error).message }, req });
      throw err;
    }

    const allErrors: RowError[] = [
      ...invalid.map((r) => ({ row: r.rowNumber, employeeCode: String(r.preview["employeeCode"] ?? ""), messages: r.errors })),
      ...(result.errors ?? []),
    ];
    const successCount = result.successCount;
    const failureCount = invalid.length + result.failureCount;
    const status = successCount === 0 ? "FAILED" : failureCount > 0 ? "PARTIAL" : "COMPLETED";

    const saved = await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status,
        successCount,
        failureCount,
        errors: allErrors.length ? (allErrors as object) : undefined,
        summary: result.summary ? (result.summary as object) : undefined,
      },
    });

    audit({
      action: "import.commit",
      entity: "ImportBatch",
      entityId: batch.id,
      after: { type, fileName: file.originalname, totalRows: validated.length, successCount, failureCount, status },
      req,
    });
    return saved;
  },

  /** Import history, scoped to the types the caller is allowed to manage. */
  async history(req: Request, type?: string) {
    const perms = await resolvePermissions(req.user!.id);
    const allowedTypes = listImporters()
      .filter((i) => perms.has(i.permission))
      .map((i) => i.type);
    return prisma.importBatch.findMany({
      where: { type: type ? type : { in: allowedTypes } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },

  async getBatch(id: string) {
    const batch = await prisma.importBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundError("Import batch");
    return batch;
  },

  /** Assert the caller holds the permission for a batch's importer type. */
  async assertCanAccess(req: Request, type: string) {
    const permission = getImporter(type)?.permission;
    const perms = await resolvePermissions(req.user!.id);
    if (!permission || !perms.has(permission)) throw new ForbiddenError("You do not have permission for this import");
  },

  /** Build an error-report .xlsx for a batch. */
  async errorReport(id: string, req: Request): Promise<{ buffer: Buffer; fileName: string }> {
    const batch = await this.getBatch(id);
    await this.assertCanAccess(req, batch.type);
    const errors = (batch.errors as RowError[] | null) ?? [];
    return { buffer: buildErrorReport(errors), fileName: `somhr-import-${id}-errors.xlsx` };
  },

  /** Undo a committed batch (delete what it created) via the importer's rollback. */
  async rollback(id: string, req: Request) {
    const batch = await this.getBatch(id);
    await this.assertCanAccess(req, batch.type);
    if (batch.status === "ROLLED_BACK") throw new BadRequestError("This import was already rolled back.");
    const importer = getImporter(batch.type);
    if (!importer?.rollback) throw new BadRequestError("This import type does not support rollback.");

    await importer.rollback(batch.id, contextFrom(req, new Map()));
    await prisma.importBatch.delete({ where: { id } });
    audit({ action: "import.delete", entity: "ImportBatch", entityId: id, after: { type: batch.type, fileName: batch.fileName, successCount: batch.successCount }, req });
    return { deleted: true };
  },

  /** Resolve the permission required for a type (used by the route guard). */
  permissionFor(type: string) {
    return getImporter(type)?.permission ?? null;
  },
};
