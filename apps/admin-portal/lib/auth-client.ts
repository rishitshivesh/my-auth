import { SentryClient } from '@scrolloop/sdk';

export const authClient = new SentryClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'http://localhost:4000',
  tenant: process.env.NEXT_PUBLIC_SENTRY_TENANT_SLUG || 'sentry',
  debug: process.env.NODE_ENV === 'development',
});
