import type { SentryClient } from '@scrolloop/sdk';
import { currentPageTenant, getTenantClient } from './tenant-client';

/**
 * The SDK client for the tenant of the current page. Modules resolve it on every access, so the
 * same code works on the platform host, on `{slug}.{root}` and under `/t/{slug}`, and the client
 * is the very instance hosted sign-in just authenticated (no stale signed-out state after login).
 */
export const authClient: SentryClient = new Proxy({} as SentryClient, {
  get(_target, property) {
    const client = getTenantClient(currentPageTenant());
    const value: unknown = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
  has(_target, property) {
    return Reflect.has(getTenantClient(currentPageTenant()), property);
  },
});
