/**
 * Scrolloop Sentry SDK - Next.js Module
 *
 * SSR-safe client that works in:
 * - Server Components
 * - API Routes
 * - Middleware
 * - Client Components (use /react instead)
 */

import { SentryClient } from '../core/client';
import type { SentryConfig, Transport, TransportRequest, TransportResponse } from '../core/types';

/**
 * Create a Next.js server-side client
 * Injects cookies from request into fetch calls
 */
export function createServerClient(
  config: Omit<SentryConfig, 'transport'>,
  cookies?: Record<string, string>,
): SentryClient {
  // Create custom transport that includes cookies
  const transport: Transport = async (req: TransportRequest): Promise<TransportResponse> => {
    const headers = {
      ...req.headers,
    };

    // Inject cookies if provided
    if (cookies) {
      const cookieHeader = Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');

      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }
    }

    const response = await fetch(req.url, {
      method: req.method,
      headers,
      body: req.body ? JSON.stringify(req.body) : undefined,
      credentials: 'include',
    });

    let data: any;
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data,
    };
  };

  return new SentryClient({
    ...config,
    transport,
  });
}

/**
 * Helper to get cookies from Next.js request
 */
export function getCookiesFromRequest(req: Request): Record<string, string> {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};

  cookieHeader.split(';').forEach((cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      cookies[key] = value;
    }
  });

  return cookies;
}

/**
 * Create client from Next.js request
 * Usage in API routes or Server Components
 */
export function getSentryClient(
  baseURL: string,
  tenant: string,
  req: Request,
): SentryClient {
  const cookies = getCookiesFromRequest(req);

  return createServerClient(
    {
      baseURL,
      tenant,
    },
    cookies,
  );
}

// Re-export core
export { SentryClient } from '../core/client';
export type * from '../core/types';
