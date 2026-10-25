/**
 * Scrolloop Sentry SDK - React Provider
 *
 * React Context for auth state management
 */

"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SentryClient } from "../core/client";
import type {
  User,
  LoginCredentials,
  LoginResponse,
  AuthEvent,
  SentryConfig,
  LoginIntentResponse,
} from "../core/types";
import type {
  AuthOutcome,
  ReauthInput,
  SessionEstablished,
  MagicLinkSent,
  RedirectOptions,
  MfaLoginOutcome,
  Passkey,
  PasskeyLoginStart,
  SocialConnection,
  WebAuthnCredentialJSON,
} from "../core/api-types";
import { isSessionEstablished } from "../core/api-types";
import { isRecentAuthRequired } from "../core/modules/context";

// ============================================================
// CONTEXT
// ============================================================

interface AuthContextValue {
  // State
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<LoginResponse>;
  loginIntent: (params: { email: string }) => Promise<LoginIntentResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  forgotPassword: (email: string, options?: RedirectOptions) => Promise<void>;
  resetPassword: (email: string, otp: string, password: string) => Promise<void>;

  // MFA
  verifyMfaLogin: (tempToken: string, code: string) => Promise<MfaLoginOutcome>;
  verifyMfaBackupLogin: (tempToken: string, code: string) => Promise<MfaLoginOutcome>;

  // Other sign-in methods
  initiateSocialLogin: (provider: string) => void;
  claimSocialSession: (ct: string) => Promise<void>;
  sendMagicLink: (email: string, options?: RedirectOptions & { poll?: boolean }) => Promise<MagicLinkSent>;
  verifyMagicLink: (token: string) => Promise<AuthOutcome>;
  startPasskeyLogin: (email: string) => Promise<PasskeyLoginStart>;
  finishPasskeyLogin: (
    email: string,
    assertion: WebAuthnCredentialJSON,
    sessionNonce: string,
  ) => Promise<AuthOutcome>;
  authenticateWithPasskey: (email: string) => Promise<AuthOutcome>;

  // Passkey management
  startPasskeyRegistration: () => Promise<WebAuthnCredentialJSON>;
  finishPasskeyRegistration: (
    response: WebAuthnCredentialJSON,
    deviceName?: string,
  ) => Promise<{ credentialId: string }>;
  listPasskeys: () => Promise<Passkey[]>;
  deletePasskey: (credentialId: string) => Promise<void>;

  // Social account linking
  getSocialConnections: () => Promise<SocialConnection[]>;
  unlinkSocialAccount: (provider: string) => Promise<void>;
  initiateSocialLinking: (provider: string) => Promise<void>;

  // Client (use client.account / .mfa / .sessions / .invites / .consent /
  // .social / .tenant for everything else, or the dedicated hooks below)
  client: SentryClient;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ============================================================
// PROVIDER
// ============================================================

interface AuthProviderProps {
  children: React.ReactNode;
  client: SentryClient;
}

export function SentryProvider({ children, client }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Initialize - check if user is logged in
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);

        // Wait for SDK to restore session from cookie
        await client.waitForInit();

        if (client.isAuthenticated()) {
          setUser(await client.getCurrentUser());
        } else {
          setUser(null);
        }
      } catch {
        // No restorable session; surface as signed-out, not as an error.
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [client]);

  // Listen to auth events
  useEffect(() => {
    const unsubscribe = client.on((event: AuthEvent) => {
      switch (event.type) {
        case "logout":
        case "session_expired":
          setUser(null);
          break;

        case "error":
          setError(event.error);
          break;
      }
    });

    return unsubscribe;
  }, [client]);

  /** Run an action, recording failures on `error` and rethrowing them. */
  const track = async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      setError(null);
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  };

  /** Like track(), but shows a loading state while the action runs. */
  const trackLoading = <T,>(action: () => Promise<T>): Promise<T> =>
    track(async () => {
      setIsLoading(true);
      try {
        return await action();
      } finally {
        setIsLoading(false);
      }
    });

  /** If the outcome established a session, load the user; otherwise leave state alone. */
  const adopt = async <T extends AuthOutcome>(outcome: T): Promise<T> => {
    if (isSessionEstablished(outcome)) {
      setUser(outcome.user ? (outcome.user as unknown as User) : null);
      try {
        setUser(await client.getCurrentUser());
      } catch {
        // Keep the user from the login response as a fallback.
      }
    }
    return outcome;
  };

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    client,
    login: (credentials) => track(async () => adopt(await client.login(credentials))),
    loginIntent: ({ email }) => track(() => client.loginIntent(email)),
    logout: () =>
      track(async () => {
        await client.logout();
        setUser(null);
      }),
    refreshUser: async () => {
      try {
        setUser(await client.getCurrentUser());
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setUser(null);
      }
    },
    forgotPassword: (email, options) => track(() => client.forgotPassword(email, options)),
    resetPassword: (email, otp, password) => track(() => client.resetPassword(email, otp, password)),
    verifyMfaLogin: (tempToken, code) =>
      trackLoading(async () => adopt(await client.verifyMfaLogin(tempToken, code))),
    verifyMfaBackupLogin: (tempToken, code) =>
      trackLoading(async () => adopt(await client.verifyMfaBackupLogin(tempToken, code))),
    initiateSocialLogin: (provider) => client.initiateSocialLogin(provider),
    claimSocialSession: (ct) =>
      trackLoading(async () => {
        await client.claimSocialSession(ct);
        setUser(await client.getCurrentUser());
      }),
    sendMagicLink: (email, options) => track(() => client.sendMagicLink(email, options)),
    verifyMagicLink: (token) => trackLoading(async () => adopt(await client.verifyMagicLink(token))),
    startPasskeyLogin: (email) => track(() => client.startPasskeyLogin(email)),
    finishPasskeyLogin: (email, assertion, sessionNonce) =>
      trackLoading(async () => adopt(await client.finishPasskeyLogin(email, assertion, sessionNonce))),
    authenticateWithPasskey: (email) =>
      trackLoading(async () => adopt(await client.authenticateWithPasskey(email))),
    startPasskeyRegistration: () => track(() => client.startPasskeyRegistration()),
    finishPasskeyRegistration: (response, deviceName) =>
      track(() => client.finishPasskeyRegistration(response, deviceName)),
    listPasskeys: () => track(() => client.listPasskeys()),
    deletePasskey: (credentialId) => track(() => client.deletePasskey(credentialId)),
    getSocialConnections: () => track(() => client.getSocialConnections()),
    unlinkSocialAccount: (provider) => track(() => client.unlinkSocialAccount(provider)),
    initiateSocialLinking: (provider) => track(() => client.initiateSocialLinking(provider)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================
// HOOK
// ============================================================

/**
 * Hook to access auth context
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within SentryProvider");
  }

  return context;
}

/**
 * Hook to access user only
 */
export function useUser() {
  const { user, isLoading, isAuthenticated } = useAuth();

  return {
    user,
    isLoading,
    isAuthenticated,
  };
}

/**
 * Hook to access session state.
 *
 * `session` carries non-secret claims (tenantId, tenantSlug, groups) cached
 * from the last login/refresh — never the access token itself, which lives
 * only in an httpOnly cookie (see docs/adr/0003-access-token-delivery.md).
 */
export function useSession() {
  const { isAuthenticated, isLoading, client } = useAuth();

  return {
    isAuthenticated,
    isLoading,
    session: client.getSessionClaims(),
  };
}

// ============================================================
// CLIENT FACTORY + MODULE HOOKS
// ============================================================

/**
 * Create (and memoise) a SentryClient for a tenant. Not a singleton: pass a
 * different `tenant` (e.g. from the request subdomain) and you get a different
 * client, which is what a portal serving many tenants needs. The client is
 * rebuilt only when baseURL or tenant change.
 */
export function useCreateSentryClient(config: SentryConfig): SentryClient {
  const configRef = useRef(config);
  configRef.current = config;
  return useMemo(
    () => new SentryClient(configRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.baseURL, config.tenant],
  );
}

/** The SentryClient behind the surrounding SentryProvider. */
export function useSentryClient(): SentryClient {
  return useAuth().client;
}

/** Registration, email verification, profile, password, deletion, step-up. */
export const useAccount = () => useSentryClient().account;
/** Authenticated MFA management (TOTP, backup codes, email OTP). */
export const useMfa = () => useSentryClient().mfa;
/** Device/session list and revocation. */
export const useSessions = () => useSentryClient().sessions;
/** Invitation preview and acceptance. */
export const useInvites = () => useSentryClient().invites;
/** OAuth/OIDC authorize URL and consent decision. */
export const useConsent = () => useSentryClient().consent;
/** Social login and account linking. */
export const useSocial = () => useSentryClient().social;
/** Passkey sign-in, registration and management. */
export const usePasskeys = () => useSentryClient().passkeys;
/** Tenant audit log (admin). */
export const useAudit = () => useSentryClient().audit;
/** Workspace discovery, branding and self-service creation. */
export const useTenantApi = () => useSentryClient().tenant;
/** Sign-in building blocks (providers, intent, magic link, MFA). */
export const useSignIn = () => useSentryClient().signIn;

// ============================================================
// ACTION HOOKS
// ============================================================

export interface ActionState<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult>;
  isPending: boolean;
  error: Error | null;
  data: TResult | undefined;
  reset: () => void;
}

/**
 * Track pending/error/data for any async SDK call:
 * `const verify = useSentryAction(account.verifyEmail)`. `run` rethrows so
 * callers can branch on typed errors, and never claims success early.
 */
export function useSentryAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): ActionState<TArgs, TResult> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<TResult | undefined>(undefined);
  const actionRef = useRef(action);
  actionRef.current = action;

  const run = useCallback(async (...args: TArgs): Promise<TResult> => {
    setIsPending(true);
    setError(null);
    try {
      const result = await actionRef.current(...args);
      setData(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setIsPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setData(undefined);
  }, []);

  return { run, isPending, error, data, reset };
}

export interface RecentAuthState {
  /** True after an action failed with ACCESS_RECENT_AUTH_REQUIRED: show a password prompt. */
  needsReauth: boolean;
  /**
   * Run a sensitive action. If the server demands recent authentication,
   * `needsReauth` flips on and the call rejects with the original error.
   */
  guard: <T>(action: () => Promise<T>) => Promise<T>;
  /**
   * Step up (password string, TOTP code or passkey assertion), then re-run the
   * action that was interrupted. Rejects with the server error if step-up fails.
   */
  reauthenticate: (input: string | ReauthInput) => Promise<{ outcome: SessionEstablished; retried: boolean }>;
  cancel: () => void;
}

/** Step-up flow for actions the backend protects with RequireRecentAuth. */
export function useRecentAuth(): RecentAuthState {
  const client = useSentryClient();
  const [needsReauth, setNeedsReauth] = useState(false);
  const pending = useRef<(() => Promise<unknown>) | null>(null);

  const guard = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (err) {
      if (isRecentAuthRequired(err)) {
        pending.current = action;
        setNeedsReauth(true);
      }
      throw err;
    }
  }, []);

  const reauthenticate = useCallback(
    async (input: string | ReauthInput) => {
      const outcome = await client.account.reauthenticate(input);
      const retry = pending.current;
      pending.current = null;
      setNeedsReauth(false);
      if (retry) await retry();
      return { outcome, retried: retry !== null };
    },
    [client],
  );

  const cancel = useCallback(() => {
    pending.current = null;
    setNeedsReauth(false);
  }, []);

  return { needsReauth, guard, reauthenticate, cancel };
}

export { isRecentAuthRequired };
