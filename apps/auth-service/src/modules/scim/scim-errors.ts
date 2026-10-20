import { ProtocolException } from "@/common/http";
import type { ScimError } from "./scim.types";

export const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

/** RFC 7644 section 3.12 scimType values used here. */
export type ScimType = "uniqueness" | "invalidValue" | "invalidSyntax" | "noTarget";

/** RFC 7644 error response: status is a string, content type application/scim+json. */
export function scimError(
  status: number,
  detail: string,
  scimType?: ScimType,
): ProtocolException {
  const body: ScimError = {
    schemas: [SCIM_ERROR_SCHEMA],
    status: String(status),
    detail,
    ...(scimType ? { scimType } : {}),
  };
  const headers: Record<string, string> =
    status === 401 ? { "WWW-Authenticate": 'Bearer realm="scim"' } : {};
  return new ProtocolException(status, { ...body }, headers);
}
