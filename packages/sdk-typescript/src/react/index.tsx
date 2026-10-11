/**
 * Scrolloop Sentry SDK - React Provider
 *
 * React Context for auth state management
 */

"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { SentryClient } from "../core/client";
import type { User, LoginCredentials, LoginResponse, AuthEvent, LoginIntentResponse, PasskeyChallengeResponse } from "../core/types";

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
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (otp: string, password: string) => Promise<void>;

  // MFA
  verifyMfaLogin: (tempToken: string, code: string) => Promise<void>;
  verifyMfaBackupLogin: (tempToken: string, code: string) => Promise<void>;

  // New auth methods
  initiateSocialLogin: (provider: string) => void;
  claimSocialSession: (ct: string) => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  verifyMagicLink: (token: string) => Promise<void>;
  startPasskeyLogin: (email: string) => Promise<PasskeyChallengeResponse>;
  finishPasskeyLogin: (email: string, assertion: unknown, sessionNonce: string) => Promise<void>;
  authenticateWithPasskey: (email: string) => Promise<void>;

  // Passkey management
  startPasskeyRegistration: () => Promise<unknown>;
  finishPasskeyRegistration: (response: unknown, deviceName?: string) => Promise<{ credentialId: string }>;
  listPasskeys: () => Promise<unknown[]>;
  deletePasskey: (credentialId: string) => Promise<void>;

  // Social account linking
  getSocialConnections: () => Promise<unknown[]>;
  unlinkSocialAccount: (provider: string) => Promise<void>;
  initiateSocialLinking: (provider: string) => Promise<void>;

  // Client
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

        // If we have a token now, get the user
        if (client.isAuthenticated()) {
          const currentUser = await client.getCurrentUser();
          setUser(currentUser);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Failed to restore session:", err);
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

  // Login
  const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
    try {
      setError(null);
      const result = await client.login(credentials);
      if (!result.mfaRequired) {
        setUser(result.user ?? null);
        // Fetch fresh user data from server to ensure all fields are populated
        try {
          const freshUser = await client.getCurrentUser();
          setUser(freshUser);
        } catch {
          // Use the user from login response as fallback
        }
      }
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const loginIntent = async ({ email }: { email: string }) => {
    try {
      setError(null);
      return await client.loginIntent(email);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  // Logout
  const logout = async () => {
    try {
      setError(null);
      await client.logout();
      setUser(null);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  // Refresh user data
  const refreshUser = async () => {
    try {
      const currentUser = await client.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setError(err as Error);
      setUser(null);
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      setError(null);
      await client.forgotPassword(email);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const resetPassword = async (otp: string, password: string) => {
    try {
      setError(null);
      await client.resetPassword(otp, password);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const verifyMfaLogin = async (tempToken: string, code: string) => {
    try {
      setError(null);
      setIsLoading(true);
      await client.verifyMfaLogin(tempToken, code);
      const currentUser = await client.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyMfaBackupLogin = async (tempToken: string, code: string) => {
    try {
      setError(null);
      setIsLoading(true);
      await client.request({
        url: `${client.getBaseURL()}/auth/mfa/verify-backup`,
        method: "POST",
        body: { tempToken, code },
      });
      const currentUser = await client.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const initiateSocialLogin = (provider: string) => {
    client.initiateSocialLogin(provider);
  };

  const claimSocialSession = async (ct: string) => {
    try {
      setError(null);
      setIsLoading(true);
      await client.claimSocialSession(ct);
      const currentUser = await client.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const sendMagicLink = async (email: string) => {
    try {
      setError(null);
      await client.sendMagicLink(email);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const verifyMagicLink = async (token: string) => {
    try {
      setError(null);
      setIsLoading(true);
      await client.verifyMagicLink(token);
      const currentUser = await client.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const startPasskeyLogin = async (email: string): Promise<PasskeyChallengeResponse> => {
    try {
      setError(null);
      return await client.startPasskeyLogin(email);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const finishPasskeyLogin = async (email: string, assertion: unknown, sessionNonce: string): Promise<void> => {
    try {
      setError(null);
      setIsLoading(true);
      await client.finishPasskeyLogin(email, assertion, sessionNonce);
      const currentUser = await client.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const authenticateWithPasskey = async (email: string): Promise<void> => {
    try {
      setError(null);
      setIsLoading(true);
      await client.authenticateWithPasskey(email);
      const currentUser = await client.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const startPasskeyRegistration = async (): Promise<unknown> => {
    try {
      setError(null);
      return await client.startPasskeyRegistration();
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const finishPasskeyRegistration = async (
    registrationResponse: unknown,
    deviceName?: string,
  ): Promise<{ credentialId: string }> => {
    try {
      setError(null);
      return await client.finishPasskeyRegistration(registrationResponse, deviceName);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const listPasskeys = async (): Promise<unknown[]> => {
    try {
      setError(null);
      return await client.listPasskeys();
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const deletePasskey = async (credentialId: string): Promise<void> => {
    try {
      setError(null);
      return await client.deletePasskey(credentialId);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const getSocialConnections = async (): Promise<unknown[]> => {
    try {
      setError(null);
      return await client.getSocialConnections();
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const unlinkSocialAccount = async (provider: string): Promise<void> => {
    try {
      setError(null);
      return await client.unlinkSocialAccount(provider);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const initiateSocialLinking = async (provider: string): Promise<void> => {
    try {
      setError(null);
      return await client.initiateSocialLinking(provider);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
    refreshUser,
    forgotPassword,
    resetPassword,
    client,
    loginIntent,
    verifyMfaLogin,
    verifyMfaBackupLogin,
    initiateSocialLogin,
    claimSocialSession,
    sendMagicLink,
    verifyMagicLink,
    startPasskeyLogin,
    finishPasskeyLogin,
    authenticateWithPasskey,
    startPasskeyRegistration,
    finishPasskeyRegistration,
    listPasskeys,
    deletePasskey,
    getSocialConnections,
    unlinkSocialAccount,
    initiateSocialLinking,
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
 * Hook to access session state
 */
export function useSession() {
  const { isAuthenticated, isLoading, client } = useAuth();
  const [accessToken, setAccessToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    client.getAccessToken().then((token) => {
      if (!cancelled) setAccessToken(token);
    }).catch(() => {
      if (!cancelled) setAccessToken(undefined);
    });
    return () => { cancelled = true; };
  }, [client, isAuthenticated]);

  return {
    isAuthenticated,
    isLoading,
    accessToken,
  };
}
