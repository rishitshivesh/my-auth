/**
 * Authenticated MFA management (/mfa/*). Login-time challenges live in the
 * sign-in module (/auth/mfa/*).
 */

import type { BackupCodes, MessageResult, MfaStatus, TotpEnabled, TotpSetup } from "../api-types";
import { call, type ModuleContext } from "./context";

export interface MfaModule {
  getStatus(): Promise<MfaStatus>;
  /** Step 1 of TOTP enrolment: returns the secret, QR data URL and backup codes. */
  setupTotp(): Promise<TotpSetup>;
  /** Step 2: confirm with a 6-digit code to switch TOTP on. */
  confirmTotp(code: string): Promise<TotpEnabled>;
  /** Requires recent authentication. */
  disableTotp(): Promise<MessageResult>;
  /** Requires recent authentication. */
  disableAll(): Promise<MessageResult>;
  regenerateBackupCodes(): Promise<BackupCodes>;
  requestEmailOtp(): Promise<{ message: string; expiresIn: string }>;
  verifyEmailOtp(code: string): Promise<MessageResult>;
}

export function createMfaModule(ctx: ModuleContext): MfaModule {
  const url = (path: string): string => `${ctx.baseURL}/mfa${path}`;
  return {
    getStatus: () => call<MfaStatus>(ctx, { url: url("/status"), method: "GET" }),
    setupTotp: () => call<TotpSetup>(ctx, { url: url("/setup/totp"), method: "POST" }),
    confirmTotp: (code) =>
      call<TotpEnabled>(ctx, { url: url("/verify/totp"), method: "POST", body: { token: code } }),
    disableTotp: () => call<MessageResult>(ctx, { url: url("/totp"), method: "DELETE" }),
    disableAll: () => call<MessageResult>(ctx, { url: url("/all"), method: "DELETE" }),
    regenerateBackupCodes: () =>
      call<BackupCodes>(ctx, { url: url("/backup-codes/regenerate"), method: "POST" }),
    requestEmailOtp: () =>
      call<{ message: string; expiresIn: string }>(ctx, { url: url("/request-email-otp"), method: "POST" }),
    verifyEmailOtp: (code) =>
      call<MessageResult>(ctx, { url: url("/verify-email-otp"), method: "POST", body: { code } }),
  };
}
