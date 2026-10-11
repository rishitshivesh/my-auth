import { SetMetadata } from "@nestjs/common";

export const RAW_RESPONSE_KEY = "raw_response";

/**
 * Opt a handler (or whole controller) out of the global `{ status, data }`
 * response envelope. Required for standards-defined payloads whose shape is
 * fixed by a spec — JWKS (RFC 7517), OIDC discovery — and for health probes.
 */
export const RawResponse = (): MethodDecorator & ClassDecorator =>
  SetMetadata(RAW_RESPONSE_KEY, true);
