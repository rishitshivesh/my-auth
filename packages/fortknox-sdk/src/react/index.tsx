/**
 * Fort Knox SDK - React Provider
 *
 * React Context for auth state management
 */

"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { FortKnoxClient } from "../core/client";
import type { User, LoginCredentials, AuthEvent } from "../core/types";

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
  login: (credentials: LoginCredentials) => Promise<void>;
  loginIntent: (params: { email: string }) => Promise<any>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (otp: string, password: string) => Promise<void>;

  // MFA
  verifyMfaLogin: (tempToken: string, code: string) => Promise<void>;

  // New auth methods
  initiateSocialLogin: (provider: string) => void;
  claimSocialSession: (ct: string) => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  verifyMagicLink: (token: string) => Promise<void>;
  startPasskeyLogin: (email: string) => Promise<any>;
  finishPasskeyLogin: (email: string, assertion: any) => Promise<void>;

  // Passkey management
  startPasskeyRegistration: () => Promise<any>;
  finishPasskeyRegistration: (response: any, deviceName?: string) => Promise<{ credentialId: string }>;
  listPasskeys: () => Promise<any[]>;
  deletePasskey: (credentialId: string) => Promise<void>;

  // Social account linking
  getSocialConnections: () => Promise<any[]>;
  unlinkSocialAccount: (provider: string) => Promise<void>;
  initiateSocialLinking: (provider: string) => Promise<void>;

  // Client
  client: FortKnoxClient;
}

const AuthContext = createContext<AuthContextValue>(undefined as any);

// ============================================================
// PROVIDER
// ============================================================

interface AuthProviderProps {
  children: React.ReactNode;
  client: FortKnoxClient;
}

export function FortKnoxProvider({ children, client }: AuthProviderProps) {
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

        console.log({ client });

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
  const login = async (credentials: LoginCredentials) => {
    try {
      setError(null);
      setIsLoading(true);

      const result = await client.login(credentials);

      if (result.mfaRequired) {
        throw new Error("MFA_REQUIRED");
      }

      setUser(result.user);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
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

  const startPasskeyLogin = async (email: string): Promise<any> => {
    try {
      setError(null);
      return await client.startPasskeyLogin(email);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const finishPasskeyLogin = async (email: string, assertion: any): Promise<void> => {
    try {
      setError(null);
      setIsLoading(true);
      await client.finishPasskeyLogin(email, assertion);
      const currentUser = await client.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const startPasskeyRegistration = async (): Promise<any> => {
    return client.startPasskeyRegistration();
  };

  const finishPasskeyRegistration = async (
    registrationResponse: any,
    deviceName?: string,
  ): Promise<{ credentialId: string }> => {
    return client.finishPasskeyRegistration(registrationResponse, deviceName);
  };

  const listPasskeys = async (): Promise<any[]> => {
    return client.listPasskeys();
  };

  const deletePasskey = async (credentialId: string): Promise<void> => {
    return client.deletePasskey(credentialId);
  };

  const getSocialConnections = async (): Promise<any[]> => {
    return client.getSocialConnections();
  };

  const unlinkSocialAccount = async (provider: string): Promise<void> => {
    return client.unlinkSocialAccount(provider);
  };

  const initiateSocialLinking = async (provider: string): Promise<void> => {
    return client.initiateSocialLinking(provider);
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
    initiateSocialLogin,
    claimSocialSession,
    sendMagicLink,
    verifyMagicLink,
    startPasskeyLogin,
    finishPasskeyLogin,
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
    throw new Error("useAuth must be used within FortKnoxProvider");
  }

  return context as AuthContextValue;
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

  return {
    isAuthenticated,
    isLoading,
    accessToken: client.getAccessToken(),
  };
}
