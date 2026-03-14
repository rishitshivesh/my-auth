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
      setIsLoading(true);

      const result = await client.loginIntent(email);
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
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
