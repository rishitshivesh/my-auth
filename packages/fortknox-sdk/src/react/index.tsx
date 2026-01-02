/**
 * Fort Knox SDK - React Provider
 * 
 * React Context for auth state management
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { FortKnoxClient } from '../core/client';
import type { User, LoginCredentials, AuthEvent } from '../core/types';

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
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  
  // Client
  client: FortKnoxClient;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
  const isInitialized = useRef(false);

  // Initialize - check if user is logged in
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const initialize = async () => {
      try {
        // Try to get current user (will auto-refresh if needed)
        const currentUser = await client.getCurrentUser();
        setUser(currentUser);
      } catch (err) {
        // Not logged in or session expired
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
        case 'logout':
        case 'session_expired':
          setUser(null);
          break;
        
        case 'error':
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
        throw new Error('MFA_REQUIRED');
      }
      
      setUser(result.user);
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

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
    refreshUser,
    client,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================
// HOOK
// ============================================================

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within FortKnoxProvider');
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
  
  return {
    isAuthenticated,
    isLoading,
    accessToken: client.getAccessToken(),
  };
}
