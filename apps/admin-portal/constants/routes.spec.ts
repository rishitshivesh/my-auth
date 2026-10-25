import { describe, expect, it } from '@jest/globals';
import { authRoutes, tenantRoutes } from './routes';
import { queryKeys } from './query-keys';
import { capabilityCopy } from './feature-flags';
import { accountNav, platformNav, tenantNav } from './navigation';

describe('routes', () => {
  it('builds tenant routes and encodes the slug', () => {
    expect(tenantRoutes('acme').users()).toBe('/t/acme/users');
    expect(tenantRoutes('a/b').user('x y')).toBe('/t/a%2Fb/users/x%20y');
  });

  it('drops empty query values', () => {
    expect(authRoutes.login({ next: '/t/acme', email: '' })).toBe('/u/login?next=%2Ft%2Facme');
    expect(authRoutes.login()).toBe('/u/login');
  });
});

describe('query keys', () => {
  it('scopes every key by tenant and principal', () => {
    const a = queryKeys({ tenant: 'acme', principal: 'u1' }).users.list({ q: 'x' });
    const b = queryKeys({ tenant: 'acme', principal: 'u2' }).users.list({ q: 'x' });
    expect(a).not.toEqual(b);
    expect(a.slice(0, 3)).toEqual(['scope', 'acme', 'u1']);
  });

  it('shares a scope prefix for bulk invalidation', () => {
    const k = queryKeys({ tenant: 'acme', principal: 'u1' });
    expect(k.roles.detail('r1').slice(0, 3)).toEqual(k.scope());
  });
});

describe('navigation', () => {
  it('has unique ids and hrefs scoped to the slug', () => {
    const entries = tenantNav('acme');
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    expect(entries.every((e) => e.href.startsWith('/t/acme/'))).toBe(true);
    expect(platformNav().length).toBeGreaterThan(0);
    expect(accountNav().length).toBeGreaterThan(0);
  });

  it('exposes handoff copy keys for capabilities', () => {
    expect(capabilityCopy('groups').requirements).toHaveLength(3);
  });
});
