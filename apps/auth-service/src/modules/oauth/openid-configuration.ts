import { ConfigService } from "@nestjs/config";
import type { OpenIDConfigurationDto } from "./dto";

const DEFAULT_ISSUER = "https://sentry.scrolloop.com";

/**
 * Builds the OIDC discovery document.
 *
 * `issuer` MUST equal the `iss` claim placed in tokens (JWT_ISSUER) or
 * conforming relying parties reject the tokens. Endpoint URLs are rooted at
 * ISSUER_BASE_URL (the externally reachable address of this service).
 * Previously the document used an unvalidated BASE_URL for both, so the
 * advertised issuer and the token `iss` could silently disagree.
 */
export function buildOpenIdConfiguration(
  config: ConfigService,
): OpenIDConfigurationDto {
  const issuer = config.get<string>("JWT_ISSUER", DEFAULT_ISSUER);
  const baseUrl = (
    config.get<string>("ISSUER_BASE_URL") ?? issuer
  ).replace(/\/+$/, "");

  return {
    issuer,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    introspection_endpoint: `${baseUrl}/oauth/introspect`,
    response_types_supported: ["code"],
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      "client_credentials",
    ],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: [
      "openid",
      "profile",
      "email",
      "phone",
      "address",
      "offline_access",
    ],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
      "none",
    ],
    code_challenge_methods_supported: ["S256", "plain"],
    claims_supported: [
      "sub",
      "email",
      "email_verified",
      "name",
      "given_name",
      "family_name",
      "picture",
    ],
  };
}
