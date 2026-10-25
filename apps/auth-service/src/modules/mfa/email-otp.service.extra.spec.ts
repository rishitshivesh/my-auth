import * as crypto from 'crypto';
import { EmailOtpService, EMAIL_OTP_MAX_ATTEMPTS, EMAIL_OTP_TTL_SECONDS } from './email-otp.service';

jest.mock('crypto', () => {
  const actual = jest.requireActual<typeof import('crypto')>('crypto');
  return { ...actual, randomInt: jest.fn(actual.randomInt) };
});
jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

function setup() {
  const store = new Map<string, unknown>();
  const k = (t: string, r: string, i: string) => `${t}|${r}|${i}`;
  const redis = {
    set: jest.fn(async (t: string, r: string, i: string, v: unknown, _ttl?: number) => void store.set(k(t, r, i), v)),
    get: jest.fn(async (t: string, r: string, i: string) => store.get(k(t, r, i)) ?? null),
    delete: jest.fn(async (t: string, r: string, i: string) => void store.delete(k(t, r, i))),
    incr: jest.fn(async (t: string, r: string, i: string) => {
      const n = ((store.get(k(t, r, i)) as number) ?? 0) + 1;
      store.set(k(t, r, i), n);
      return n;
    }),
    extendTTL: jest.fn(),
  };
  let code = '';
  const email = { sendOTPEmail: jest.fn(async (_u: unknown, c: string) => void (code = c)) };
  const users = { findById: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c' }) };
  const svc = new EmailOtpService(email as never, users as never, redis as never);
  return { svc, redis, email, users, store, sent: () => code };
}

describe('EmailOtpService (extra)', () => {
  it('404s for unknown user and sends nothing', async () => {
    const { svc, users, email, redis } = setup();
    users.findById.mockResolvedValue(null);
    await expect(svc.sendOtp('u1', 't1')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(email.sendOTPEmail).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('propagates email delivery failure', async () => {
    const { svc, email } = setup();
    email.sendOTPEmail.mockRejectedValue(new Error('smtp'));
    await expect(svc.sendOtp('u1', 't1')).rejects.toThrow('smtp');
  });

  it('generates zero-padded 6-digit codes with the 10 minute TTL', async () => {
    const { svc, redis, sent } = setup();
    (crypto.randomInt as unknown as jest.Mock).mockReturnValueOnce(42);
    await svc.sendOtp('u1', 't1');
    expect(sent()).toBe('000042');
    expect(redis.set.mock.calls[0]?.[4]).toBe(EMAIL_OTP_TTL_SECONDS);
  });

  it('verify returns false when no code was ever sent', async () => {
    const { svc, redis } = setup();
    await expect(svc.verifyOtp('u1', 't1', '123456')).resolves.toBe(false);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it.each(['', 'abcdef', '12 456', '１２３４５６', '-12345', '1e5'])('rejects non-digit input %p but burns an attempt', async (bad) => {
    const { svc, redis } = setup();
    await svc.sendOtp('u1', 't1');
    await expect(svc.verifyOtp('u1', 't1', bad)).resolves.toBe(false);
    expect(redis.incr).toHaveBeenCalledTimes(1);
  });

  it('sets TTL on the attempts counter only on the first attempt', async () => {
    const { svc, redis } = setup();
    await svc.sendOtp('u1', 't1');
    await svc.verifyOtp('u1', 't1', '000000');
    await svc.verifyOtp('u1', 't1', '000001');
    expect(redis.extendTTL).toHaveBeenCalledTimes(1);
    expect(redis.extendTTL).toHaveBeenCalledWith('t1', 'email-otp-attempts', 'u1', EMAIL_OTP_TTL_SECONDS);
  });

  it('boundary: correct code on the 5th attempt succeeds; on the 6th it is refused and destroyed', async () => {
    const a = setup();
    await a.svc.sendOtp('u1', 't1');
    const wrong = a.sent() === '000000' ? '000001' : '000000';
    for (let i = 0; i < EMAIL_OTP_MAX_ATTEMPTS - 1; i++) await a.svc.verifyOtp('u1', 't1', wrong);
    await expect(a.svc.verifyOtp('u1', 't1', a.sent())).resolves.toBe(true);

    const b = setup();
    await b.svc.sendOtp('u1', 't1');
    const wrongB = b.sent() === '000000' ? '000001' : '000000';
    for (let i = 0; i < EMAIL_OTP_MAX_ATTEMPTS; i++) await b.svc.verifyOtp('u1', 't1', wrongB);
    await expect(b.svc.verifyOtp('u1', 't1', b.sent())).resolves.toBe(false);
    await expect(b.svc.verifyOtp('u1', 't1', b.sent())).resolves.toBe(false); // code gone
  });

  it('a verified code cannot be replayed', async () => {
    const { svc, sent } = setup();
    await svc.sendOtp('u1', 't1');
    await expect(svc.verifyOtp('u1', 't1', sent())).resolves.toBe(true);
    await expect(svc.verifyOtp('u1', 't1', sent())).resolves.toBe(false);
  });

  it('does not accept another user\'s code', async () => {
    const { svc, sent } = setup();
    await svc.sendOtp('u1', 't1');
    await expect(svc.verifyOtp('u2', 't1', sent())).resolves.toBe(false);
  });

  it('a corrupted stored hash never matches (length mismatch is safe)', async () => {
    const { svc, store } = setup();
    store.set('t1|email-otp|u1', 'zz');
    await expect(svc.verifyOtp('u1', 't1', '123456')).resolves.toBe(false);
  });
});
