import type {
  ActiveSession, BackupCodes, ChangePasswordRequest, MessageResult, MfaStatus, Passkey, Profile, ProfileUpdate,
  RevokeSessionsResult, SecurityEvent, SocialConnection, TotpEnabled, TotpSetup,
} from "@scrolloop/sdk";
import { authClient } from "@/lib/auth-client";
import { withErrorHandler } from "@/lib/with-error-handler";

/**
 * Every personal-account call goes through the SDK modules and `withErrorHandler`.
 * Toasts are off: errors are returned to the view and rendered inline with the form.
 */
const quiet = { showErrorToast: false } as const;

export const accountApi = {
  getProfile: withErrorHandler<[], Profile>(() => authClient.account.getProfile(), quiet),
  updateProfile: withErrorHandler<[ProfileUpdate], MessageResult>((u) => authClient.account.updateProfile(u), quiet),
  changePassword: withErrorHandler<[ChangePasswordRequest], MessageResult>(
    (r) => authClient.account.changePassword(r), quiet,
  ),
  deleteAccount: withErrorHandler<[string], MessageResult>((p) => authClient.account.deleteAccount(p), quiet),
  listSecurityEvents: withErrorHandler<[number], SecurityEvent[]>(
    (limit) => authClient.account.listSecurityEvents(limit), quiet,
  ),

  getMfaStatus: withErrorHandler<[], MfaStatus>(() => authClient.mfa.getStatus(), quiet),
  setupTotp: withErrorHandler<[], TotpSetup>(() => authClient.mfa.setupTotp(), quiet),
  confirmTotp: withErrorHandler<[string], TotpEnabled>((code) => authClient.mfa.confirmTotp(code), quiet),
  disableTotp: withErrorHandler<[], MessageResult>(() => authClient.mfa.disableTotp(), quiet),
  disableAllMfa: withErrorHandler<[], MessageResult>(() => authClient.mfa.disableAll(), quiet),
  regenerateBackupCodes: withErrorHandler<[], BackupCodes>(() => authClient.mfa.regenerateBackupCodes(), quiet),

  listPasskeys: withErrorHandler<[], Passkey[]>(() => authClient.passkeys.list(), quiet),
  removePasskey: withErrorHandler<[string], true>(async (id) => { await authClient.passkeys.remove(id); return true; }, quiet),
  /** Browser ceremony then server confirmation; the credential never leaves this function. */
  addPasskey: withErrorHandler<[string | undefined], { credentialId: string }>(async (deviceName) => {
    const credential = await authClient.passkeys.startRegistration();
    return authClient.passkeys.finishRegistration(credential, deviceName);
  }, quiet),

  listConnections: withErrorHandler<[], SocialConnection[]>(() => authClient.social.listConnections(), quiet),
  unlinkConnection: withErrorHandler<[string], true>(async (provider) => { await authClient.social.unlink(provider); return true; }, quiet),
  // TODO(gap:Social login completion claims): the link-token route reads `req.user.userId` while
  // other routes read `req.user.sub`; linking depends on the JWT carrying both.
  /** Fetches a short-lived link token then navigates the browser to the provider. */
  startLinking: withErrorHandler<[string], void>((provider) => authClient.social.startLinking(provider), quiet),

  listSessions: withErrorHandler<[], ActiveSession[]>(() => authClient.sessions.list(), quiet),
  revokeSession: withErrorHandler<[string], true>(async (id) => { await authClient.sessions.revoke(id); return true; }, quiet),
  revokeOtherSessions: withErrorHandler<[], RevokeSessionsResult>(() => authClient.sessions.revokeOthers(), quiet),
  revokeAllSessions: withErrorHandler<[], RevokeSessionsResult>(() => authClient.sessions.revokeAll(), quiet),
} as const;
