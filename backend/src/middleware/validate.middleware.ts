import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Zod validation at the route edge. Parsed (and transformed) values replace
 * the raw request data so controllers only ever see typed, validated input.
 * Express 5 makes req.query a getter — parsed values go on res.locals.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) res.locals["query"] = schemas.query.parse(req.query);
      if (schemas.params) res.locals["params"] = schemas.params.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const getQuery = <T>(res: Response): T => res.locals["query"] as T;
export const getParams = <T>(res: Response): T => res.locals["params"] as T;
