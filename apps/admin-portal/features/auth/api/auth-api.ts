import type { SentryClient } from "@scrolloop/sdk";
import type {
  AcceptInviteRequest,
  CompleteMfaInput,
  ConsentDecision,
  MagicLinkSent,
  RedirectResult,
  RegisterRequest,
} from "@scrolloop/sdk";
import { withErrorHandler } from "@/lib/with-error-handler";

/**
 * Public hosted-identity calls. Errors are rendered inline by the views (never toasts),
 * and an expired link token must not redirect to sign-in.
 */
const quiet = <Args extends unknown[], R>(fn: (...args: Args) => Promise<unknown>) =>
  withErrorHandler<Args, R>(fn, { showErrorToast: false, redirectOnSessionEnd: false });

export function createAuthApi(client: SentryClient) {
  return {
    providers: quiet<[], Awaited<ReturnType<typeof client.signIn.getProviders>>>(() => client.signIn.getProviders()),
    intent: quiet<[string], Awaited<ReturnType<typeof client.signIn.loginIntent>>>((email) => client.signIn.loginIntent(email)),
    login: quiet<[string, string], Awaited<ReturnType<typeof client.signIn.login>>>((email, password) =>
      client.signIn.login({ email, password }),
    ),
    passkey: quiet<[string], Awaited<ReturnType<typeof client.passkeys.authenticate>>>((email) =>
      client.passkeys.authenticate(email),
    ),
    sendMagicLink: quiet<[string], void>((email) => client.signIn.sendMagicLink(email)),
    /** Sign-in link whose requesting device shows a match code and polls for completion. */
    requestMagicLink: quiet<[string], MagicLinkSent>((email) => client.signIn.sendMagicLink(email, { poll: true })),
    previewMagicLink: quiet<[string], Awaited<ReturnType<typeof client.signIn.previewMagicLink>>>((token) =>
      client.signIn.previewMagicLink(token),
    ),
    verifyMagicLink: quiet<[string, string | undefined], Awaited<ReturnType<typeof client.signIn.verifyMagicLink>>>(
      (token, matchCode) => client.signIn.verifyMagicLink(token, matchCode ? { matchCode } : undefined),
    ),
    pollMagicLink: quiet<[string], Awaited<ReturnType<typeof client.signIn.pollMagicLink>>>((nonce) =>
      client.signIn.pollMagicLink(nonce),
    ),
    validateResetLink: quiet<[string], Awaited<ReturnType<typeof client.signIn.validateResetLink>>>((token) =>
      client.signIn.validateResetLink(token),
    ),
    resetWithToken: quiet<[string, string], RedirectResult>((token, password) =>
      client.signIn.resetPasswordWithToken(token, password),
    ),
    completeMfa: quiet<[CompleteMfaInput], Awaited<ReturnType<typeof client.signIn.completeMfa>>>((input) =>
      client.signIn.completeMfa(input),
    ),
    mfaEmailOtp: quiet<[string], Awaited<ReturnType<typeof client.signIn.requestMfaEmailOtp>>>((tempToken) =>
      client.signIn.requestMfaEmailOtp(tempToken),
    ),
    mfaWebAuthnStart: quiet<[string], Awaited<ReturnType<typeof client.signIn.startMfaWebAuthn>>>((tempToken) =>
      client.signIn.startMfaWebAuthn(tempToken),
    ),
    enrollSetup: quiet<[string | undefined], Awaited<ReturnType<typeof client.signIn.enrollTotpSetup>>>((token) =>
      client.signIn.enrollTotpSetup(token),
    ),
    enrollConfirm: quiet<[string, string | undefined], Awaited<ReturnType<typeof client.signIn.enrollTotpConfirm>>>(
      (code, token) => client.signIn.enrollTotpConfirm(code, token),
    ),
    inviteRequestNew: quiet<[string], Awaited<ReturnType<typeof client.invites.requestNew>>>((token) =>
      client.invites.requestNew(token),
    ),
    verifyMfa: quiet<[string, string], Awaited<ReturnType<typeof client.signIn.verifyMfa>>>((tempToken, code) =>
      client.signIn.verifyMfa(tempToken, code),
    ),
    verifyBackup: quiet<[string, string], Awaited<ReturnType<typeof client.signIn.verifyMfaBackupCode>>>(
      (tempToken, code) => client.signIn.verifyMfaBackupCode(tempToken, code),
    ),
    register: quiet<[RegisterRequest], unknown>((request) => client.account.register(request)),
    verifyEmail: quiet<[string], RedirectResult>((token) => client.account.verifyEmail(token)),
    resendVerification: quiet<[string], unknown>((email) => client.account.resendVerification(email)),
    forgotPassword: quiet<[string], void>((email) => client.signIn.forgotPassword(email)),
    resetPassword: quiet<[string, string, string], void>((email, otp, password) =>
      client.signIn.resetPassword(email, otp, password),
    ),
    invitePreview: quiet<[string], Awaited<ReturnType<typeof client.invites.preview>>>((token) =>
      client.invites.preview(token),
    ),
    inviteAccept: quiet<[AcceptInviteRequest], unknown>((request) => client.invites.accept(request)),
    consentDetails: quiet<[string], Awaited<ReturnType<typeof client.consent.getDetails>>>((id) =>
      client.consent.getDetails(id),
    ),
    consentDecide: quiet<[ConsentDecision], Awaited<ReturnType<typeof client.consent.decide>>>((decision) =>
      client.consent.decide(decision),
    ),
    claimSocial: quiet<[string], string | null>(async (token) => {
      await client.claimSocialSession(token);
      return client.getSessionClaims()?.tenantSlug ?? null;
    }),
    profileEmail: quiet<[], string | null>(async () => (await client.account.getProfile()).email ?? null),
    mfaStatus: quiet<[], Awaited<ReturnType<typeof client.mfa.getStatus>>>(() => client.mfa.getStatus()),
    setupTotp: quiet<[], Awaited<ReturnType<typeof client.mfa.setupTotp>>>(() => client.mfa.setupTotp()),
    confirmTotp: quiet<[string], Awaited<ReturnType<typeof client.mfa.confirmTotp>>>((code) =>
      client.mfa.confirmTotp(code),
    ),
    socialLogin: (provider: string): void => client.social.login(provider),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
