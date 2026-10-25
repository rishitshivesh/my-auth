import { KeyRotationService } from './key-rotation.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
import { logger } from '@/common/logger';

function setup(cfg: Record<string, number> = {}) {
  const jwks = {
    rotateIfDue: jest.fn().mockResolvedValue(undefined),
    revokeExpiredRetiredKeys: jest.fn().mockResolvedValue(0),
  };
  const runner = {
    runExclusive: jest.fn(async (_n: string, fn: () => Promise<unknown>) => fn()),
    forEachActiveTenant: jest.fn(async (_n: string, fn: (t: { id: string }) => Promise<void>) => {
      await fn({ id: 't1' });
      await fn({ id: 't2' });
      return { tenantsRan: 2, tenantsFailed: 0 };
    }),
  };
  const config = { get: jest.fn((k: string, d: number) => cfg[k] ?? d) };
  const svc = new KeyRotationService(jwks as never, runner as never, config as never);
  return { svc, jwks, runner, config };
}

describe('KeyRotationService.dailyRotation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rotates platform key under exclusive lock, then each tenant, with config TTLs', async () => {
    const { svc, jwks, runner } = setup({ KEY_ACTIVE_TTL_DAYS: 30, KEY_ROTATION_GRACE_DAYS: 3 });
    await svc.dailyRotation();
    expect(runner.runExclusive.mock.calls[0]?.[0]).toBe('key-rotation-platform');
    expect(jwks.rotateIfDue).toHaveBeenNthCalledWith(1, null, 30);
    expect(jwks.rotateIfDue).toHaveBeenNthCalledWith(2, 't1', 30);
    expect(jwks.rotateIfDue).toHaveBeenNthCalledWith(3, 't2', 30);
    expect(jwks.revokeExpiredRetiredKeys).toHaveBeenCalledWith(3);
  });

  it('uses defaults of 90 and 7 days', async () => {
    const { svc, jwks } = setup();
    await svc.dailyRotation();
    expect(jwks.rotateIfDue).toHaveBeenCalledWith(null, 90);
    expect(jwks.revokeExpiredRetiredKeys).toHaveBeenCalledWith(7);
  });

  it('is quiet when nothing revoked and no tenant failed', async () => {
    const { svc } = setup();
    await svc.dailyRotation();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('logs summary when keys revoked or tenants failed', async () => {
    const a = setup();
    a.jwks.revokeExpiredRetiredKeys.mockResolvedValue(2);
    await a.svc.dailyRotation();
    expect(logger.info).toHaveBeenCalledTimes(1);

    const b = setup();
    b.runner.forEachActiveTenant.mockResolvedValue({ tenantsRan: 1, tenantsFailed: 1 });
    await b.svc.dailyRotation();
    expect(logger.info).toHaveBeenCalledTimes(2);
  });

  it('never throws: swallows Error and non-Error failures', async () => {
    const a = setup();
    a.jwks.rotateIfDue.mockRejectedValue(new Error('boom'));
    await expect(a.svc.dailyRotation()).resolves.toBeUndefined();
    const b = setup();
    b.jwks.revokeExpiredRetiredKeys.mockRejectedValue('str');
    await expect(b.svc.dailyRotation()).resolves.toBeUndefined();
  });
});
