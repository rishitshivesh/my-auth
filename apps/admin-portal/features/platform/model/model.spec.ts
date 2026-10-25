import { describe, expect, it } from '@jest/globals';
import { filterActivity } from './activity';
import { platformPayload } from './settings';
import { validateSetup } from './setup';
import { slugify, tenantsQueryString, validateNewTenant } from './tenants';

describe('platform models', () => {
  it('validates the setup form', () => {
    const base = { setupToken: 't', platformName: '', name: 'A', email: 'a@b.co', password: 'a'.repeat(12), confirm: 'a'.repeat(12) };
    expect(validateSetup(base)).toEqual({});
    expect(validateSetup({ ...base, password: 'short', confirm: 'x' })).toEqual({ password: 'minLength', confirm: 'mismatch' });
  });
  it('validates tenants and builds queries', () => {
    expect(slugify('Acme Corp!')).toBe('acme-corp');
    expect(validateNewTenant({ name: 'A', slug: 'ab', plan: 'free', useCurrentUserAsAdmin: false }).slug).toBe('slug');
    expect(tenantsQueryString({ search: ' x ', status: '', plan: 'pro', page: 2 })).toBe('search=x&plan=pro&page=2&limit=20');
  });
  it('filters loaded activity and omits empty support email', () => {
    const items = [{ id: '1', eventType: 'auth.login', severity: 'info', createdAt: '', actorEmail: 'a@b.co' }];
    expect(filterActivity(items, 'A@B', '')).toHaveLength(1);
    expect(filterActivity(items, '', 'high')).toHaveLength(0);
    expect(platformPayload({ platformName: 'P', supportEmail: ' ', allowPublicSignup: false, maintenanceMode: false })).not.toHaveProperty('supportEmail');
  });
});
