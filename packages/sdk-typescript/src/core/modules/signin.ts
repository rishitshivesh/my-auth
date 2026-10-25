/**
 * Sign-in flows: password, magic link, MFA completion, intent/provider discovery,
 * password recovery. Every flow that can end without a session returns a
 * discriminated AuthOutcome instead of void.
 */

import type {
  AuthOutcome,
  AuthProviders,
  MfaLoginOutcome,
  MessageResult,
} from "../api-types";
import type { LoginCredentials, LoginIntentResponse } from "../types";
import { call, callVoid, payloadOf, type ModuleContext } from "./context";
import { parseAuthOutcome, parseSessionOutcome } from "./outcome";

export interface SignInModule {
  login(credentials: LoginCredentials): Promise<AuthOutcome>;
  loginIntent(email: string): Promise<LoginIntentResponse>;
  getProviders(): Promise<AuthProviders>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(email: string, otp: string, password: string): Promise<void>;
  verifyMfa(tempToken: string, code: string): Promise<MfaLoginOutcome>;
  verifyMfaBackupCode(tempToken: string, code: string): Promise<MfaLoginOutcome>;
  sendMagicLink(email: string): Promise<void>;
  verifyMagicLink(token: string): Promise<AuthOutcome>;
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

    forgotPassword: (email) =>
      callVoid(ctx, { url: url("/forgot-password"), method: "POST", body: { email } }, { auth: false }),

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

    async verifyMfaBackupCode(tempToken, code) {
      const response = await ctx.publicRequest({
        url: url("/mfa/verify-backup"),
        method: "POST",
        body: { tempToken, code },
      });
      if (!response.ok) throw ctx.fail(response);
      return parseSessionOutcome(ctx, payloadOf(response));
    },

    sendMagicLink: (email) =>
      callVoid(ctx, { url: url("/magic-link/send"), method: "POST", body: { email } }, { auth: false }),

    async verifyMagicLink(token) {
      const response = await ctx.publicRequest({
        url: url("/magic-link/verify"),
        method: "POST",
        body: { token },
      });
      if (!response.ok) throw ctx.fail(response);
      return parseAuthOutcome(ctx, payloadOf(response));
    },
  };
}

export type { MessageResult };
