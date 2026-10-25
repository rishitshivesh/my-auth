/**
 * Account lifecycle: registration, email verification, profile, password,
 * deletion, security activity and step-up (recent authentication).
 */

import type {
  AuthOutcome,
  ChangePasswordRequest,
  MessageResult,
  Profile,
  ProfileUpdate,
  RegisterRequest,
  RegisterResult,
  SecurityEvent,
} from "../api-types";
import { call, type ModuleContext } from "./context";
import type { SignInModule } from "./signin";

export interface AccountModule {
  register(request: RegisterRequest): Promise<RegisterResult>;
  verifyEmail(token: string): Promise<MessageResult>;
  resendVerification(email: string): Promise<MessageResult>;
  getProfile(): Promise<Profile>;
  updateProfile(update: ProfileUpdate): Promise<MessageResult>;
  /** Requires recent authentication; see isRecentAuthRequired(). */
  changePassword(request: ChangePasswordRequest): Promise<MessageResult>;
  /** Requires recent authentication. Ends the local session on success. */
  deleteAccount(password: string): Promise<MessageResult>;
  listSecurityEvents(limit?: number): Promise<SecurityEvent[]>;
  /**
   * Step-up: prove the password again so `ACCESS_RECENT_AUTH_REQUIRED` actions
   * can be retried. The backend has no dedicated step-up endpoint; this signs in
   * again as the current user, so it may itself return an MFA challenge.
   */
  reauthenticate(password: string): Promise<AuthOutcome>;
}

export function createAccountModule(ctx: ModuleContext, signIn: SignInModule): AccountModule {
  const auth = (path: string): string => `${ctx.baseURL}/auth${path}`;
  const me = (path = ""): string => `${ctx.baseURL}/users/me${path}`;

  const module: AccountModule = {
    register: (request) =>
      call<RegisterResult>(ctx, { url: auth("/register"), method: "POST", body: request }, { auth: false }),

    verifyEmail: (token) =>
      call<MessageResult>(ctx, { url: auth("/verify-email"), method: "POST", body: { token } }, { auth: false }),

    resendVerification: (email) =>
      call<MessageResult>(
        ctx,
        { url: auth("/resend-verification"), method: "POST", body: { email } },
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

    async reauthenticate(password) {
      const profile = await module.getProfile();
      return signIn.login({ email: profile.email, password });
    },
  };
  return module;
}
