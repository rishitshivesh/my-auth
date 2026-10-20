import { ProtocolException } from "@/common/http";

/** RFC 6749 section 5.2 error codes. */
export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "invalid_scope"
  | "invalid_token";

const BASIC_CHALLENGE = 'Basic realm="oauth", charset="UTF-8"';

/**
 * Native RFC 6749 / RFC 6750 error response. invalid_client and invalid_token
 * are 401 with a WWW-Authenticate challenge; everything else is 400.
 */
export function oauthError(
  error: OAuthErrorCode,
  description: string,
): ProtocolException {
  const body = { error, error_description: description };
  if (error === "invalid_token") {
    return new ProtocolException(401, body, {
      "WWW-Authenticate": `Bearer error="invalid_token", error_description="${description.replace(/"/g, "'")}"`,
    });
  }
  if (error === "invalid_client") {
    return new ProtocolException(401, body, {
      "WWW-Authenticate": BASIC_CHALLENGE,
    });
  }
  return new ProtocolException(400, body);
}
