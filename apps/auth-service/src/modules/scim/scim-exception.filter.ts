import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiException, ProblemDetailsFilter } from "@/common/http";
import { SCIM_ERROR_SCHEMA } from "./scim-errors";

const fallback = new ProblemDetailsFilter();

/**
 * RFC 7644 section 3.12: protocol endpoints must answer errors in the SCIM
 * error schema. Request-validation failures on /scim/v2 become 400
 * `invalidValue`; everything else (and the token-management routes) keeps the
 * standard problem+json handling.
 */
@Catch(ApiException)
export class ScimExceptionFilter implements ExceptionFilter<ApiException> {
  catch(exception: ApiException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const isProtocolRoute = (req.originalUrl ?? req.url).includes("/scim/v2/");
    if (!isProtocolRoute || (exception.code !== "VALIDATION_FAILED" && exception.code !== "BAD_REQUEST")) {
      fallback.catch(exception, host);
      return;
    }
    const detail = exception.errors?.map((e) => `${e.field}: ${e.message}`).join("; ") ?? exception.detail ?? "Invalid request";
    http
      .getResponse<Response>()
      .status(400)
      .type("application/scim+json")
      .json({ schemas: [SCIM_ERROR_SCHEMA], status: "400", scimType: "invalidValue", detail });
  }
}
