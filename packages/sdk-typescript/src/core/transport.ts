/**
 * Scrolloop Sentry SDK - Default Transport
 *
 * Uses the Fetch API (works in browsers and Node 18+)
 */

import type { Transport, TransportRequest, TransportResponse } from './types';

/**
 * Creates a fetch-based transport
 * Works in browsers and Node.js 18+
 */
export function createFetchTransport(): Transport {
  return async (request: TransportRequest): Promise<TransportResponse> => {
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        credentials: request.credentials || 'include',
        // Auth state (link validity, session, MFA status) must never come from the HTTP cache:
        // browsers heuristically cache error statuses such as 410 and would replay a stale answer.
        cache: 'no-store',
      });

      // Parse response body
      let data: unknown;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // Convert Headers to plain object
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers,
        data,
      };
    } catch (error) {
      // Network error or fetch failure
      throw new Error(`Network request failed: ${error}`);
    }
  };
}
