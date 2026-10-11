import { describe, it, expect } from 'vitest';
import {
  createAuthState,
  markAuthenticated,
  clearAuthentication,
  isSessionExpiringSoon,
} from './state';

describe('createAuthState', () => {
  it('starts unauthenticated with no cached session', () => {
    const state = createAuthState();
    expect(state.authenticated).toBe(false);
    expect(state.expiresAt).toBeUndefined();
    expect(state.session).toBeUndefined();
  });
});

describe('markAuthenticated', () => {
  it('marks the session live and caches the expiry and claims', () => {
    const state = createAuthState();
    const session = { tenantId: 't1', tenantSlug: 'acme', groups: ['admin'] };

    markAuthenticated(state, 900, session);

    expect(state.authenticated).toBe(true);
    expect(state.session).toEqual(session);
    expect(state.expiresAt).toBeGreaterThan(Date.now());
  });

  it('marks the session live even without an expiry or claims', () => {
    const state = createAuthState();

    markAuthenticated(state);

    expect(state.authenticated).toBe(true);
    expect(state.expiresAt).toBeUndefined();
    expect(state.session).toBeUndefined();
  });

  it('never stores the access token itself', () => {
    const state = createAuthState();
    markAuthenticated(state, 900, { tenantId: 't1', tenantSlug: 'acme', groups: [] });
    expect(state).not.toHaveProperty('accessToken');
  });
});

describe('clearAuthentication', () => {
  it('resets authenticated, expiry and cached session', () => {
    const state = createAuthState();
    markAuthenticated(state, 900, { tenantId: 't1', tenantSlug: 'acme', groups: [] });

    clearAuthentication(state);

    expect(state.authenticated).toBe(false);
    expect(state.expiresAt).toBeUndefined();
    expect(state.session).toBeUndefined();
  });
});

describe('isSessionExpiringSoon', () => {
  it('is true when never authenticated', () => {
    const state = createAuthState();
    expect(isSessionExpiringSoon(state)).toBe(true);
  });

  it('is false when authenticated with no known expiry (reactive refresh covers it)', () => {
    const state = createAuthState();
    markAuthenticated(state);
    expect(isSessionExpiringSoon(state)).toBe(false);
  });

  it('is false when well before the margin', () => {
    const state = createAuthState();
    markAuthenticated(state, 900); // 15 minutes
    expect(isSessionExpiringSoon(state, 30)).toBe(false);
  });

  it('is true once inside the margin', () => {
    const state = createAuthState();
    markAuthenticated(state, 20); // expires in 20s, margin is 30s
    expect(isSessionExpiringSoon(state, 30)).toBe(true);
  });
});
