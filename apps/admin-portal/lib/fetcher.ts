/**
 * Authenticated fetcher for admin API calls.
 * Attaches the current access token via the SDK and handles 401s.
 */
import { authClient } from '@/app/layout'
import { withErrorHandler } from './with-error-handler'

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'http://localhost:4000'

export function apiUrl(path: string): string {
  return `${AUTH_URL}${path}`
}

/**
 * Authenticated fetcher using authClient.request
 */
export const authFetcher = <T = unknown>(url: string): Promise<T> => {
  return withErrorHandler<[string], T>(
    async (url: string) => {
      return authClient.request({
        url: url.startsWith('http') ? url : apiUrl(url),
        method: 'GET',
      });
    },
    { showErrorToast: true }
  )(url);
};

/**
 * Authenticated mutator using authClient.request
 */
export const authMutate = <T = unknown>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT',
  body?: unknown
): Promise<T> => {
  return withErrorHandler<[string, 'POST' | 'PATCH' | 'DELETE' | 'PUT', unknown?], T>(
    async (url: string, method: 'POST' | 'PATCH' | 'DELETE' | 'PUT', body?: unknown) => {
      return authClient.request({
        url: url.startsWith('http') ? url : apiUrl(url),
        method,
        body,
      });
    },
    { showErrorToast: true }
  )(url, method, body);
};
