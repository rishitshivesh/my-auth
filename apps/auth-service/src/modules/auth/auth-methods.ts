/**
 * Authentication Methods References (OIDC `amr`, RFC 8176 where a registered value exists).
 * Set when a login completes, persisted on the session, and carried in the access token so
 * /oauth/authorize can put an accurate `amr` (and `auth_time`) in the ID token.
 */
export const Amr = {
  PASSWORD: "pwd",
  OTP: "otp",
  TOTP: "totp",
  BACKUP_CODE: "backup_code",
  HARDWARE_KEY: "hwk",
  WEBAUTHN: "webauthn",
  MFA: "mfa",
  MAGIC_LINK: "magic_link",
  SSO: "sso",
  SAML: "saml",
  SOCIAL: "social",
} as const;

export type AmrValue = (typeof Amr)[keyof typeof Amr];

/** Method sets per completed login type. */
export const AMR_PASSWORD: readonly AmrValue[] = [Amr.PASSWORD];
export const AMR_PASSWORD_TOTP: readonly AmrValue[] = [Amr.PASSWORD, Amr.OTP, Amr.TOTP, Amr.MFA];
export const AMR_PASSWORD_BACKUP_CODE: readonly AmrValue[] = [Amr.PASSWORD, Amr.BACKUP_CODE, Amr.MFA];
export const AMR_PASSKEY: readonly AmrValue[] = [Amr.HARDWARE_KEY, Amr.WEBAUTHN];
export const AMR_MAGIC_LINK: readonly AmrValue[] = [Amr.MAGIC_LINK];
export const AMR_SOCIAL: readonly AmrValue[] = [Amr.SOCIAL];
export const AMR_SAML: readonly AmrValue[] = [Amr.SSO, Amr.SAML];

/** Space-separated storage form (same as oauth_authorization_codes.amr). */
export function serializeAmr(amr: readonly string[]): string {
  return amr.join(" ");
}

export function parseAmr(stored: string | null | undefined): string[] {
  return stored ? stored.split(" ").filter(Boolean) : [];
}
