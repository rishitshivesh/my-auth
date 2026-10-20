import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import {
  ERROR_STATUS,
  PROBLEM_TYPE_PREFIX,
  type ErrorCode,
  type ProblemDetails,
} from "@scrolloop/types";
import type { Request, Response } from "express";
import { logger } from "@/common/logger";
import { ApiException, ProtocolException } from "./api.exception";
import { ERROR_TITLES } from "./error-titles";

const PROBLEM_JSON = "application/problem+json";
const UNKNOWN_REQUEST_ID = "unknown";

function codeForStatus(status: number): ErrorCode {
  if (status === 401) return "AUTH_TOKEN_INVALID";
  if (status === 403) return "ACCESS_FORBIDDEN";
  if (status === 404) return "RESOURCE_NOT_FOUND";
  if (status === 409) return "RESOURCE_CONFLICT";
  if (status === 413) return "UPLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 501) return "NOT_IMPLEMENTED";
  if (status >= 500) return "INTERNAL_ERROR";
  return "BAD_REQUEST";
}

/** Nest HttpException, or http-errors from body-parser (bad JSON, too big). */
function statusOf(exception: unknown): number | null {
  if (exception instanceof HttpException) return exception.getStatus();
  if (typeof exception === "object" && exception !== null) {
    const status = (exception as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 600) return status;
  }
  return null;
}

/** Pure: maps anything thrown to a problem document; unexpected errors never leak their message. */
export function toProblemDetails(
  exception: unknown,
  requestId: string,
): ProblemDetails {
  const code: ErrorCode =
    exception instanceof ApiException
      ? exception.code
      : codeForStatus(statusOf(exception) ?? 500);

  const problem: ProblemDetails = {
    type: `${PROBLEM_TYPE_PREFIX}${code}`,
    title: ERROR_TITLES[code],
    status: ERROR_STATUS[code],
    code,
    requestId,
  };

  if (exception instanceof ApiException) {
    if (exception.detail !== undefined) problem.detail = exception.detail;
    if (exception.errors !== undefined) problem.errors = exception.errors;
    if (exception.retryAfterSeconds !== undefined) {
      problem.retryAfterSeconds = exception.retryAfterSeconds;
    }
  }
  return problem;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    if (response.headersSent) return;

    if (exception instanceof ProtocolException) {
      response.set(exception.headers);
      response.status(exception.getStatus()).json(exception.body);
      return;
    }

    const problem = toProblemDetails(
      exception,
      request.requestId ?? UNKNOWN_REQUEST_ID,
    );
    if (problem.status >= 500) {
      logger.error({ err: exception, requestId: problem.requestId }, "Unhandled error");
    }
    if (problem.retryAfterSeconds !== undefined) {
      response.setHeader("Retry-After", String(problem.retryAfterSeconds));
    }
    response.status(problem.status).type(PROBLEM_JSON).json(problem);
  }
}
