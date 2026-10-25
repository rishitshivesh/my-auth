/**
 * Sign-in flows: password, magic link, MFA completion, intent/provider discovery,
 * password recovery. Every flow that can end without a session returns a
 * discriminated AuthOutcome instead of void.
 */

import type {
  AuthOutcome,
  AuthProviders,
  CompleteMfaInput,
  MagicLinkPoll,
  MagicLinkPreview,
  MagicLinkVerifyOptions,
  MagicLinkVerifyOutcome,
  MagicLinkSent,
  MfaEmailOtpSent,
  MfaEnrollmentCompleted,
  MfaLoginOutcome,
  MfaWebAuthnStart,
  MessageResult,
  RedirectOptions,
  RedirectResult,
  ResetLinkStatus,
  TotpEnrollmentSetup,
} from "../api-types";
import type { LoginCredentials, LoginIntentResponse } from "../types";
import { call, callVoid, payloadOf, type ModuleContext } from "./context";
import { parseAuthOutcome, parseSessionOutcome } from "./outcome";
import { buildQuery } from "./context";

export interface SignInModule {
  login(credentials: LoginCredentials): Promise<AuthOutcome>;
  loginIntent(email: string): Promise<LoginIntentResponse>;
  getProviders(): Promise<AuthProviders>;
  forgotPassword(email: string, options?: RedirectOptions): Promise<void>;
  /** Fallback flow: emailed 6-digit code bound to `email`. */
  resetPassword(email: string, otp: string, password: string): Promise<void>;
  /** Check a reset link without consuming it (safe against email scanners). */
  validateResetLink(token: string): Promise<ResetLinkStatus>;
  /** Link flow: single-use token from the reset email. */
  resetPasswordWithToken(token: string, password: string): Promise<RedirectResult>;
  verifyMfa(tempToken: string, code: string): Promise<MfaLoginOutcome>;
  /** Complete the login challenge with any method the challenge offered. */
  completeMfa(input: CompleteMfaInput): Promise<MfaLoginOutcome>;
  verifyMfaBackupCode(tempToken: string, code: string): Promise<MfaLoginOutcome>;
  requestMfaEmailOtp(tempToken: string): Promise<MfaEmailOtpSent>;
  startMfaWebAuthn(tempToken: string): Promise<MfaWebAuthnStart>;
  /** Pre-session enrolment (login returned `mfa_enrollment_required`). Token may come from the cookie. */
  enrollTotpSetup(enrollmentToken?: string): Promise<TotpEnrollmentSetup>;
  enrollTotpConfirm(code: string, enrollmentToken?: string): Promise<MfaEnrollmentCompleted>;
  sendMagicLink(email: string, options?: RedirectOptions & { poll?: boolean }): Promise<MagicLinkSent>;
  /** Non-consuming: who asked for this link and whether approving elsewhere needs a match code. */
  previewMagicLink(token: string): Promise<MagicLinkPreview>;
  /**
   * Without `matchCode` this signs in the clicking device (and voids any pending cross-device
   * request). With the correct code it resolves `{status:"confirmed-on-other-device"}` and
   * creates NO session here. A wrong code is 401 AUTH_OTP_INVALID; five voids the request.
   */
  verifyMagicLink(token: string, options?: MagicLinkVerifyOptions): Promise<MagicLinkVerifyOutcome>;
  /** Cross-device completion: resolves `{status:"pending"}` until the link is opened elsewhere. */
  pollMagicLink(pollingNonce: string): Promise<MagicLinkPoll>;
}

export function createSignInModule(ctx: ModuleContext): SignInModule {
  const url = (path: string): string => `${ctx.baseURL}/auth${path}`;

  return {
    async login(credentials) {
      ctx.log("Login attempt", { email: credentials.email });
      const response = await ctx.publicRequest({
        url: url("/login"),
        method: "POST",
        body: credentials,
      });
      if (!response.ok) throw ctx.fail(response);
      return parseAuthOutcome(ctx, payloadOf(response));
    },

    loginIntent: (email) =>
      call<LoginIntentResponse>(ctx, { url: url("/login-intent"), method: "POST", body: { email } }, { auth: false }),

    getProviders: () => call<AuthProviders>(ctx, { url: url("/providers"), method: "GET" }, { auth: false }),

    forgotPassword: (email, options) =>
      callVoid(
        ctx,
        { url: url("/forgot-password"), method: "POST", body: { email, redirectUri: options?.redirectUri } },
        { auth: false },
      ),

    validateResetLink: (token) =>
      call<ResetLinkStatus>(
        ctx,
        { url: url(`/reset-password/validate${buildQuery({ token })}`), method: "GET" },
        { auth: false },
      ),

    resetPasswordWithToken: (token, password) =>
      call<RedirectResult>(
        ctx,
        { url: url("/reset-password"), method: "POST", body: { token, password } },
        { auth: false },
      ),

    resetPassword: (email, otp, password) =>
      callVoid(
        ctx,
        { url: url("/reset-password"), method: "POST", body: { email, otp, password } },
        { auth: false },
      ),

    async verifyMfa(tempToken, code) {
      const response = await ctx.publicRequest({
        url: url("/mfa/verify"),
        method: "POST",
        body: { tempToken, code },
      });
      if (!response.ok) throw ctx.fail(response);
      return parseSessionOutcome(ctx, payloadOf(response));
    },

    async completeMfa(input) {
      const response = await ctx.publicRequest({ url: url("/mfa/verify"), method: "POST", body: input });
      if (!response.ok) throw ctx.fail(response);
      return parseSessionOutcome(ctx, payloadOf(response));
    },

    requestMfaEmailOtp: (tempToken) =>
      call<MfaEmailOtpSent>(ctx, { url: url("/mfa/request-email-otp"), method: "POST", body: { tempToken } }, { auth: false }),

    startMfaWebAuthn: (tempToken) =>
      call<MfaWebAuthnStart>(ctx, { url: url("/mfa/webauthn/start"), method: "POST", body: { tempToken } }, { auth: false }),

    enrollTotpSetup: (enrollmentToken) =>
      call<TotpEnrollmentSetup>(
        ctx,
        { url: url("/mfa/enroll/totp/setup"), method: "POST", body: { enrollmentToken } },
        { auth: false },
      ),

    async enrollTotpConfirm(code, enrollmentToken) {
      const response = await ctx.publicRequest({
        url: url("/mfa/enroll/totp/confirm"),
        method: "POST",
        body: { code, enrollmentToken },
      });
      if (!response.ok) throw ctx.fail(response);
      const payload = payloadOf(response);
      const session = parseSessionOutcome(ctx, payload);
      const codes = Array.isArray(payload.backupCodes)
        ? payload.backupCodes.filter((c): c is string => typeof c === "string")
        : [];
      return { ...session, backupCodes: codes };
    },

    async verifyMfaBackupCode(tempToken, code) {
      const response = await ctx.publicRequest({
        url: url("/mfa/verify-backup"),
        method: "POST",
        body: { tempToken, code },
      });
      if (!response.ok) throw ctx.fail(response);
      return parseSessionOutcome(ctx, payloadOf(response));
    },

    sendMagicLink: (email, options) =>
      call<MagicLinkSent>(
        ctx,
        { url: url("/magic-link/send"), method: "POST", body: { email, redirectUri: options?.redirectUri, poll: options?.poll } },
        { auth: false },
      ),

    previewMagicLink: (token) =>
      call<MagicLinkPreview>(
        ctx,
        { url: url(`/magic-link/preview${buildQuery({ token })}`), method: "GET" },
        { auth: false },
      ),

    async verifyMagicLink(token, options) {
      const response = await ctx.publicRequest({
        url: url("/magic-link/verify"),
        method: "POST",
        body: { token, matchCode: options?.matchCode },
      });
      if (!response.ok) throw ctx.fail(response);
      const payload = payloadOf(response);
      if (payload.status === "confirmed-on-other-device") {
        return {
          status: "confirmed-on-other-device",
          redirectUri: typeof payload.redirectUri === "string" ? payload.redirectUri : undefined,
        };
      }
      return parseAuthOutcome(ctx, payload);
    },

    async pollMagicLink(pollingNonce) {
      const response = await ctx.publicRequest({
        url: url("/magic-link/poll"),
        method: "POST",
        body: { pollingNonce },
      });
      if (!response.ok) throw ctx.fail(response);
      const payload = payloadOf(response);
      if (payload.status === "pending") return { status: "pending" };
      return parseAuthOutcome(ctx, payload);
    },
  };
}

export type { MessageResult };
