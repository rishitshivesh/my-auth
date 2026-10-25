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

/** Second factors that can be completed at /auth/mfa/verify (+ its helper endpoints). */
export const COMPLETABLE_MFA_METHODS = ["totp", "email", "webauthn"] as const;
export type CompletableMfaMethod = (typeof COMPLETABLE_MFA_METHODS)[number];

/** Never advertise a method (e.g. sms) the login cannot actually complete. */
export function completableMfaMethods(methods: readonly string[]): string[] {
  return methods.filter((m) => (COMPLETABLE_MFA_METHODS as readonly string[]).includes(m));
}

export function preferredCompletable(methods: readonly string[], preferred?: string | null): string {
  const usable = completableMfaMethods(methods);
  return preferred && usable.includes(preferred) ? preferred : (usable[0] ?? "totp");
}

export type FirstFactor = "pwd" | "magic_link" | "passkey" | "social";

/** Truthful `amr` for a session: the first factor that was proven plus the second factor method. */
export function amrAfterSecondFactor(
  first: string | undefined,
  second: CompletableMfaMethod | "backup_code",
): readonly AmrValue[] {
  const base =
    first === "magic_link" ? AMR_MAGIC_LINK
    : first === "social" ? AMR_SOCIAL
    : first === "passkey" ? AMR_PASSKEY
    : AMR_PASSWORD;
  const extra: AmrValue[] =
    second === "totp" ? [Amr.OTP, Amr.TOTP, Amr.MFA]
    : second === "email" ? [Amr.OTP, Amr.MFA]
    : second === "webauthn" ? [Amr.HARDWARE_KEY, Amr.WEBAUTHN, Amr.MFA]
    : [Amr.BACKUP_CODE, Amr.MFA];
  return [...new Set([...base, ...extra])];
}
