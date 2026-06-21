export interface SentrySDKConfig {
  baseURL: string;
  tenantSlug: string;
  debug: boolean;
  timeout: number;
  retries: number;
  withCredentials: boolean;
  tokenRefreshBuffer: number;
}

export function resolveSentryConfig(overrides?: Partial<SentrySDKConfig>): SentrySDKConfig {
  const baseURL = overrides?.baseURL
    ?? process.env['NEXT_PUBLIC_AUTH_SERVICE_URL']
    ?? process.env['SENTRY_BASE_URL']
    ?? process.env['AUTH_SERVICE_URL'];

  if (!baseURL) {
    throw new Error(
      '[Scrolloop Sentry] baseURL is required. ' +
      'Set NEXT_PUBLIC_AUTH_SERVICE_URL (Next.js) or SENTRY_BASE_URL (Node.js)'
    );
  }

  const tenantSlug = overrides?.tenantSlug
    ?? process.env['NEXT_PUBLIC_SENTRY_TENANT_SLUG']
    ?? process.env['SENTRY_TENANT_SLUG'];

  if (!tenantSlug) {
    throw new Error(
      '[Scrolloop Sentry] tenantSlug is required. ' +
      'Set NEXT_PUBLIC_SENTRY_TENANT_SLUG. Must be a slug (e.g. "acme"), not a UUID.'
    );
  }

  return {
    baseURL: baseURL.replace(/\/$/, ''),
    tenantSlug,
    debug: overrides?.debug ?? process.env['NODE_ENV'] === 'development',
    timeout: overrides?.timeout ?? 10_000,
    retries: overrides?.retries ?? 1,
    withCredentials: overrides?.withCredentials ?? true,
    tokenRefreshBuffer: overrides?.tokenRefreshBuffer ?? 60,
  };
}

export { SentryAxiosTransport, SentryAPIError } from './transport';
