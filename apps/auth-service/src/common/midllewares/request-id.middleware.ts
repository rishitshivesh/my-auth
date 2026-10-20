import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

/** Caller-supplied ids are accepted only if short and log-safe. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id =
    incoming !== undefined && SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();

  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
