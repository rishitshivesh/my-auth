import { RbacCacheService } from './rbac-cache.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

describe('RbacCacheService', () => {
  const redis = { get: jest.fn(), set: jest.fn(), delete: jest.fn(), deletePattern: jest.fn() };
  const svc = new RbacCacheService(redis as never);
  beforeEach(() => jest.clearAllMocks());

  it('get delegates with rbac resource namespace', async () => {
    redis.get.mockResolvedValue({ a: 1 });
    expect(await svc.get('t', 'k')).toEqual({ a: 1 });
    expect(redis.get).toHaveBeenCalledWith('t', 'rbac', 'k');
  });

  it('set uses default TTL of 300s and honors override', async () => {
    await svc.set('t', 'k', 1);
    expect(redis.set).toHaveBeenCalledWith('t', 'rbac', 'k', 1, 300);
    await svc.set('t', 'k', 2, 10);
    expect(redis.set).toHaveBeenLastCalledWith('t', 'rbac', 'k', 2, 10);
  });

  it('invalidateUser deletes the per-user policies key only', async () => {
    await svc.invalidateUser('u1', 't');
    expect(redis.delete).toHaveBeenCalledWith('t', 'rbac', 'policies:u1');
  });

  it('invalidateTenant deletes by tenant pattern', async () => {
    await svc.invalidateTenant('t');
    expect(redis.deletePattern).toHaveBeenCalledWith('t', 'rbac:*');
  });

  it('propagates redis failures', async () => {
    redis.delete.mockRejectedValueOnce(new Error('down'));
    await expect(svc.invalidateUser('u', 't')).rejects.toThrow('down');
  });
});
