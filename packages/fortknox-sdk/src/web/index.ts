/**
 * Fort Knox SDK - Web Module
 * 
 * Browser-specific helpers
 * Adds OAuth redirects, social login, etc.
 */

import { FortKnoxClient } from '../core/client';
import type { FortKnoxConfig } from '../core/types';

/**
 * Create a browser-optimized Fort Knox client
 */
export function createWebClient(config: Omit<FortKnoxConfig, 'transport'>): FortKnoxClient {
  return new FortKnoxClient({
    ...config,
    // Browser always uses fetch with credentials
    transport: undefined, // Uses default fetch transport
  });
}

/**
 * Auto-detect tenant from subdomain
 * Example: acme.auth.scrolloop.com -> tenant: "acme"
 */
export function getTenantFromSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  
  // Need at least 3 parts: subdomain.domain.tld
  if (parts.length < 3) return null;
  
  return parts[0] || null;
}

/**
 * OAuth helper - get social login URL
 */
export function getSocialLoginUrl(
  baseURL: string,
  provider: 'google' | 'github' | 'microsoft',
  options?: {
    tenant?: string;
    redirectUri?: string;
  },
): string {
  const params = new URLSearchParams();
  
  if (options?.tenant) {
    params.append('tenantId', options.tenant);
  }
  
  if (options?.redirectUri) {
    params.append('returnUrl', options.redirectUri);
  } else if (typeof window !== 'undefined') {
    params.append('returnUrl', window.location.origin + '/auth/callback');
  }
  
  return `${baseURL}/auth/social/${provider}/login?${params.toString()}`;
}

/**
 * Redirect to social login
 */
export function redirectToSocialLogin(
  baseURL: string,
  provider: 'google' | 'github' | 'microsoft',
  options?: {
    tenant?: string;
    redirectUri?: string;
  },
): void {
  const url = getSocialLoginUrl(baseURL, provider, options);
  window.location.href = url;
}

/**
 * Handle OAuth callback
 * Extracts tokens from URL and stores them
 */
// @ts-expect-error
export function handleOAuthCallback(client: FortKnoxClient): void {
  if (typeof window === 'undefined') return;
  
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('access_token');
  
  if (accessToken) {
    // Token will be in cookie, client will handle it automatically
    // Remove tokens from URL for security
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Re-export core types and client
export { FortKnoxClient } from '../core/client';
export type * from '../core/types';
