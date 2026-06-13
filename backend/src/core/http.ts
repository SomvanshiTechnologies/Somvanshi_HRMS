import type { Response } from "express";

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const ok = <T>(res: Response, data: T, message?: string) =>
  res.status(200).json({ success: true, data, ...(message ? { message } : {}) });

export const created = <T>(res: Response, data: T, message?: string) =>
  res.status(201).json({ success: true, data, ...(message ? { message } : {}) });

export const noContent = (res: Response) => res.status(204).send();

export const paginated = <T>(res: Response, data: T[], meta: PageMeta) =>
  res.status(200).json({ success: true, data, meta });

export const buildMeta = (page: number, limit: number, total: number): PageMeta => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
