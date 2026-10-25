import { describe, expect, it } from '@jest/globals';
import { cooldownSecondsFor, remainingSeconds } from './resend-cooldown';
import { consumeIntent, isRecentlyAuthenticated, reauthUrl, sanitizeReturnPath, saveIntent } from './recent-auth';
import { isDirty } from './unsaved-changes';
import { hasAllPermissions, hasAnyPermission, hasPermission } from './permissions';
import { email, minLength, required, validate } from './validation';
import { linkStatusFromErrorCode } from './link-status';
import { RECENT_AUTH_INTENT_TTL_MS, RECENT_AUTH_WINDOW_MS } from '@/constants/limits';

describe('resend cooldown', () => {
  it('rounds remaining time up and never goes negative', () => {
    expect(remainingSeconds(10_200, 10_000)).toBe(1);
    expect(remainingSeconds(10_000, 20_000)).toBe(0);
  });
  it('backs off then caps', () => {
    expect(cooldownSecondsFor(0)).toBeLessThan(cooldownSecondsFor(2));
    expect(cooldownSecondsFor(99)).toBe(cooldownSecondsFor(2));
  });
});

describe('recent auth', () => {
  it('respects the window', () => {
    expect(isRecentlyAuthenticated(1000, 1000 + RECENT_AUTH_WINDOW_MS)).toBe(true);
    expect(isRecentlyAuthenticated(1000, 1001 + RECENT_AUTH_WINDOW_MS)).toBe(false);
    expect(isRecentlyAuthenticated(undefined, 1)).toBe(false);
  });
  it('rejects open-redirect return paths', () => {
    expect(sanitizeReturnPath('//evil.com')).toBe('/');
    expect(sanitizeReturnPath('https://evil.com')).toBe('/');
    expect(sanitizeReturnPath('/t/acme/users?x=1')).toBe('/t/acme/users?x=1');
    expect(reauthUrl('//evil.com')).toBe('/u/login?next=%2F&reauth=1');
  });
  it('stores an intent once and expires it', () => {
    const data = new Map<string, string>();
    const storage = {
      setItem: (k: string, v: string) => void data.set(k, v),
      getItem: (k: string) => data.get(k) ?? null,
      removeItem: (k: string) => void data.delete(k),
    };
    saveIntent(storage, { returnTo: '/t/acme', action: 'delete', createdAt: 0 });
    expect(consumeIntent(storage, 1)?.action).toBe('delete');
    expect(consumeIntent(storage, 1)).toBeNull();
    saveIntent(storage, { returnTo: '/t/acme', action: 'delete', createdAt: 0 });
    expect(consumeIntent(storage, RECENT_AUTH_INTENT_TTL_MS + 1)).toBeNull();
  });
});

describe('unsaved changes', () => {
  it('compares structurally', () => {
    expect(isDirty({ a: [1, 2], b: 'x' }, { b: 'x', a: [1, 2] })).toBe(false);
    expect(isDirty({ a: [1] }, { a: [1, 2] })).toBe(true);
  });
});

describe('permissions', () => {
  it('supports exact, wildcard and global grants', () => {
    expect(hasPermission(['users:read'], 'users:read')).toBe(true);
    expect(hasPermission(['users:*'], 'users:delete')).toBe(true);
    expect(hasPermission(['users:*'], 'roles:read')).toBe(false);
    expect(hasPermission(['*'], 'anything')).toBe(true);
    expect(hasAnyPermission(['a'], ['b', 'a'])).toBe(true);
    expect(hasAllPermissions(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('validation', () => {
  it('returns the first failing issue as a copy key', () => {
    expect(validate('', [required, email])?.key).toBe('common.validation.required');
    expect(validate('nope', [required, email])?.key).toBe('common.validation.email');
    expect(validate('ab', [minLength(3)])?.params).toEqual({ min: 3 });
    expect(validate('a@b.co', [required, email])).toBeNull();
  });
});

describe('link status', () => {
  it('maps codes and defaults to invalid', () => {
    expect(linkStatusFromErrorCode('AUTH_TOKEN_EXPIRED')).toBe('expired');
    expect(linkStatusFromErrorCode('TENANT_MISMATCH')).toBe('wrong-account');
    expect(linkStatusFromErrorCode('???')).toBe('invalid');
  });
});
