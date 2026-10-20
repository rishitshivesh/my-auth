import { ValidationError } from "@nestjs/common";
import type { FieldError } from "@scrolloop/types";
import { ApiException } from "./api.exception";

function flatten(errors: ValidationError[], parent = ""): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** Passed to ValidationPipe so DTO failures become VALIDATION_FAILED with field errors. */
export function validationExceptionFactory(errors: ValidationError[]): ApiException {
  return new ApiException("VALIDATION_FAILED", { errors: flatten(errors) });
}
