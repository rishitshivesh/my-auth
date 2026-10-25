import type { AuthProviders, LoginIntentResponse } from "@scrolloop/sdk";

export type LoginStep = "email" | "methods" | "password" | "email-link-sent";

export interface LoginMethods {
  password: boolean;
  magicLink: boolean;
  passkey: boolean;
  social: readonly string[];
}

/**
 * Methods to offer. For unknown accounts the server answers with tenant-level
 * methods, so the UI never branches on `exists` (no account enumeration).
 */
export function resolveMethods(
  providers: AuthProviders | null,
  intent: LoginIntentResponse | null,
): LoginMethods {
  const tenantSocial = (providers?.social ?? []).map((p) => p.provider);
  if (intent && intent.exists) {
    return {
      password: intent.methods.password,
      magicLink: intent.methods.magicLink,
      passkey: intent.methods.passkey,
      social: intent.methods.social,
    };
  }
  return {
    password: providers?.password ?? true,
    magicLink: providers?.magicLink ?? false,
    passkey: providers?.passkey ?? false,
    social: tenantSocial,
  };
}

export function hasAnyMethod(methods: LoginMethods): boolean {
  return methods.password || methods.magicLink || methods.passkey || methods.social.length > 0;
}

/** True when only password remains: skip the chooser. */
export function isPasswordOnly(methods: LoginMethods): boolean {
  return methods.password && !methods.magicLink && !methods.passkey && methods.social.length === 0;
}

export function nextStepAfterEmail(methods: LoginMethods): "methods" | "password" {
  return isPasswordOnly(methods) ? "password" : "methods";
}

export type ProgressStep = Exclude<LoginStep, "email-link-sent">;

export const LOGIN_STEP_ORDER: readonly ProgressStep[] = ["email", "methods", "password"];

export interface SocialProviderRef {
  provider: string;
}

export function isSocialEnabled(methods: LoginMethods, provider: string): boolean {
  return methods.social.includes(provider);
}
