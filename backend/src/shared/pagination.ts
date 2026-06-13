import { z } from "zod";

export const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(64).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type PageQuery = z.infer<typeof PageQuerySchema>;

export const toSkipTake = (q: Pick<PageQuery, "page" | "limit">) => ({
  skip: (q.page - 1) * q.limit,
  take: q.limit,
});

/** Whitelist sort columns to prevent ordering by arbitrary fields. */
export function safeOrderBy<T extends string>(
  sort: string | undefined,
  order: "asc" | "desc",
  allowed: readonly T[],
  fallback: T
): Record<string, "asc" | "desc"> {
  const column = allowed.includes(sort as T) ? (sort as T) : fallback;
  return { [column]: order };
}
