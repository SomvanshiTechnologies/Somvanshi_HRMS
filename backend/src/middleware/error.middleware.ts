import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, NotFoundError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { isProd } from "../config/env.js";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err, path: req.path }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
    return;
  }

  // Prisma known request errors → friendly messages (no raw 500s)
  const prismaCode = (err as { code?: string })?.code;
  if (typeof prismaCode === "string" && prismaCode.startsWith("P")) {
    const meta = (err as { meta?: { target?: string[] | string; field_name?: string } }).meta;
    const map: Record<string, { status: number; code: string; message: string }> = {
      P2002: { status: 409, code: "CONFLICT", message: `That ${[meta?.target].flat().filter(Boolean).join(", ") || "value"} is already in use` },
      P2003: {
        status: 400,
        code: "FK_CONSTRAINT",
        message: `A linked record was not found${meta?.field_name ? ` for "${String(meta.field_name).replace(/_fkey.*$/i, "").replace(/^.*?_/, "")}"` : ""}. It may have been removed — reselect a valid option and try again.`,
      },
      P2025: { status: 404, code: "NOT_FOUND", message: "Record not found" },
    };
    const mapped = map[prismaCode];
    if (mapped) {
      // Always log constraint errors with the route + Prisma meta so the exact
      // failing relation is visible in the server console for diagnosis.
      logger.warn(
        { path: req.path, method: req.method, prismaCode, meta, detail: (err as Error).message?.split("\n").pop()?.trim() },
        "prisma constraint error"
      );
      res.status(mapped.status).json({
        success: false,
        error: {
          code: mapped.code,
          message: mapped.message,
          ...(isProd ? {} : { detail: (err as Error).message?.split("\n").pop()?.trim() }),
        },
      });
      return;
    }
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error({ err, path: req.path }, message);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: isProd ? "An unexpected error occurred" : message,
    },
  });
}
