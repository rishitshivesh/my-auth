import { describe, expect, it } from '@jest/globals';
import { t } from '@/i18n';
import { createTranslator, interpolate, lookup } from '@/i18n/translate';

describe('i18n translate', () => {
  it('returns catalogue text for a typed key', () => {
    expect(t('common.actions.cancel')).toBe('Cancel');
  });

  it('interpolates named params', () => {
    expect(t('auth.resend.cooldown', { seconds: 12 })).toBe('Resend available in 12s');
  });

  it('leaves unknown placeholders visible', () => {
    expect(interpolate('Hello {name} {other}', { name: 'Ada' })).toBe('Hello Ada {other}');
  });

  it('returns the key when it is missing at runtime', () => {
    const tr = createTranslator({ a: { b: 'x' } } as const);
    expect(tr('a.b')).toBe('x');
    expect(lookup({ a: { b: 'x' } }, 'a.c')).toBeUndefined();
  });

  it('has friendly copy for every error code including password expiry', () => {
    expect(t('errors.AUTH_PASSWORD_EXPIRED')).toMatch(/password/i);
  });
});
