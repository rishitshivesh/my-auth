import { describe, expect, it } from '@jest/globals';
import { auditQuery, EMPTY_AUDIT_FILTERS, sanitizeMetadata, validateAuditFilters } from './audit';
import { brandContrast, isValidHex, validateLogo } from './branding';
import { addOrigin, checkOrigin } from './origins';
import { fromDraft, toDraft, validatePolicyDraft } from './password-policy';
import { changedFlags, domainState, flagDraft } from './settings';

describe('audit model', () => {
  it('omits empty filters and expands dates to UTC bounds', () => {
    const q = auditQuery({ ...EMPTY_AUDIT_FILTERS, eventType: 'auth.login_failed', startDate: '2026-10-01', endDate: '2026-10-02' }, { limit: 50 });
    expect(q).toContain('eventType=auth.login_failed');
    expect(q).toContain('startDate=2026-10-01T00%3A00%3A00.000Z');
    expect(q).not.toContain('userId');
  });
  it('rejects an inverted range', () => {
    expect(validateAuditFilters({ ...EMPTY_AUDIT_FILTERS, startDate: '2026-10-05', endDate: '2026-10-01' }).endDate).toBe('range');
  });
  it('redacts secret-like metadata keys', () => {
    expect(sanitizeMetadata({ apiToken: 'x', plan: 'pro' })).toEqual([{ key: 'apiToken', value: '[redacted]' }, { key: 'plan', value: 'pro' }]);
  });
});

describe('branding model', () => {
  it('validates hex, logo and contrast', () => {
    expect(isValidHex('#2abf6c')).toBe(true);
    expect(isValidHex('2abf6c')).toBe(false);
    expect(validateLogo({ type: 'image/gif', size: 1 })).toBe('type');
    expect(validateLogo({ type: 'image/png', size: 600 * 1024 })).toBe('size');
    expect(brandContrast('#000000')?.lightOk).toBe(true);
    expect(brandContrast('#ffff00')?.lightOk).toBe(false);
    expect(brandContrast('nope')).toBeNull();
  });
});

describe('origins model', () => {
  it('mirrors server rules', () => {
    expect(checkOrigin('https://App.example.com')).toEqual({ origin: 'https://app.example.com' });
    expect(checkOrigin('*.example.com')).toEqual({ error: 'wildcard' });
    expect(checkOrigin('http://example.com')).toEqual({ error: 'http' });
    expect(checkOrigin('https://a.com/path')).toEqual({ error: 'path' });
    expect(addOrigin(['https://a.com'], 'https://a.com')).toEqual({ error: 'duplicate' });
  });
});

describe('password policy model', () => {
  const policy = { minLength: 12, requireCommonPasswordCheck: true, historyCount: 5, maxAgeDays: 0, lockoutThreshold: 5, lockoutDurationMinutes: 15 };
  it('round-trips and validates bounds', () => {
    expect(fromDraft(toDraft(policy))).toEqual(policy);
    expect(validatePolicyDraft({ ...toDraft(policy), minLength: '8' }).minLength).toBe('range');
    expect(validatePolicyDraft({ ...toDraft(policy), historyCount: 'x' }).historyCount).toBe('integer');
  });
});

describe('settings model', () => {
  it('diffs flags and reports domain state', () => {
    const saved = flagDraft({ mfaRequired: false });
    expect(changedFlags(saved, { ...saved, mfaRequired: true })).toEqual({ mfaRequired: true });
    expect(domainState({ customDomain: 'a.com', customDomainVerified: false })).toBe('pending');
    expect(domainState({})).toBe('none');
  });
});
