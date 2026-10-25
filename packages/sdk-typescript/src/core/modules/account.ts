/**
 * Account lifecycle: registration, email verification, profile, password,
 * deletion, security activity and step-up (recent authentication).
 */

import type {
  ChangePasswordRequest,
  MessageResult,
  PasskeyLoginStart,
  ReauthInput,
  RedirectOptions,
  RedirectResult,
  SessionEstablished,
  Profile,
  ProfileUpdate,
  RegisterRequest,
  RegisterResult,
  SecurityEvent,
} from "../api-types";
import { call, payloadOf, type ModuleContext } from "./context";

export interface AccountModule {
  register(request: RegisterRequest): Promise<RegisterResult>;
  verifyEmail(token: string): Promise<RedirectResult>;
  resendVerification(email: string, options?: RedirectOptions): Promise<MessageResult>;
  getProfile(): Promise<Profile>;
  updateProfile(update: ProfileUpdate): Promise<MessageResult>;
  /** Requires recent authentication; see isRecentAuthRequired(). */
  changePassword(request: ChangePasswordRequest): Promise<MessageResult>;
  /** Requires recent authentication. Ends the local session on success. */
  deleteAccount(password: string): Promise<MessageResult>;
  listSecurityEvents(limit?: number): Promise<SecurityEvent[]>;
  /**
   * Step-up for `ACCESS_RECENT_AUTH_REQUIRED` actions: prove the password, a
   * TOTP code or a passkey on the *current* session. A string is shorthand for
   * a password. On success the session's auth time is refreshed; retry the action.
   */
  reauthenticate(input: string | ReauthInput): Promise<SessionEstablished>;
  /** WebAuthn options + `sessionNonce` for a `{method:"webauthn"}` reauthenticate(). */
  startReauthWebAuthn(): Promise<PasskeyLoginStart>;
}

export function createAccountModule(ctx: ModuleContext): AccountModule {
  const auth = (path: string): string => `${ctx.baseURL}/auth${path}`;
  const me = (path = ""): string => `${ctx.baseURL}/users/me${path}`;

  const module: AccountModule = {
    register: (request) =>
      call<RegisterResult>(ctx, { url: auth("/register"), method: "POST", body: request }, { auth: false }),

    verifyEmail: (token) =>
      call<RedirectResult>(ctx, { url: auth("/verify-email"), method: "POST", body: { token } }, { auth: false }),

    resendVerification: (email, options) =>
      call<MessageResult>(
        ctx,
        { url: auth("/resend-verification"), method: "POST", body: { email, redirectUri: options?.redirectUri } },
        { auth: false },
      ),

    getProfile: () => call<Profile>(ctx, { url: me(), method: "GET" }),

    updateProfile: (update) => call<MessageResult>(ctx, { url: me(), method: "PUT", body: update }),

    changePassword: (request) =>
      call<MessageResult>(ctx, { url: me("/change-password"), method: "POST", body: request }),

    async deleteAccount(password) {
      const result = await call<MessageResult>(ctx, {
        url: me(),
        method: "DELETE",
        body: { password },
      });
      ctx.endLocalSession();
      return result;
    },

    async listSecurityEvents(limit) {
      const query = limit === undefined ? "" : `?limit=${encodeURIComponent(String(limit))}`;
      return call<SecurityEvent[]>(ctx, { url: me(`/security-events${query}`), method: "GET" });
    },

    async reauthenticate(input) {
      const body: ReauthInput = typeof input === "string" ? { method: "password", password: input } : input;
      const payload = payloadOf(await send(ctx, auth("/reauth"), body));
      const session = payload.session as SessionEstablished["session"];
      const expiresIn = typeof payload.expiresIn === "number" ? payload.expiresIn : 0;
      ctx.sessionEstablished(expiresIn, session);
      return { expiresIn, tenantSlug: session?.tenantSlug ?? "", session };
    },

    startReauthWebAuthn: () =>
      call<PasskeyLoginStart>(ctx, { url: auth("/reauth/webauthn/start"), method: "POST" }),
  };
  return module;
}

async function send(ctx: ModuleContext, url: string, body: unknown) {
  // publicRequest: a wrong password answers 401 and must not trigger the
  // refresh/clear-session path (that would sign the user out for a typo).
  const response = await ctx.publicRequest({ url, method: "POST", body });
  if (!response.ok) throw ctx.fail(response);
  return response;
}
