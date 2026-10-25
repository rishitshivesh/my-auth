import 'reflect-metadata';
import { TenantRegistrationController } from './tenant-registration.controller';

jest.mock('./tenant-registration.service', () => ({ TenantRegistrationService: class TenantRegistrationService {}, RegisterTenantDto: class RegisterTenantDto {} }));
jest.mock('@/common/decorators/public.decorator', () => ({ Public: () => () => undefined }));
jest.mock('@/common/decorators/rate-limit.decorator', () => ({ RateLimit: () => () => undefined }));
jest.mock('@/common/service/redis.service', () => ({ RedisService: class RedisService {} }));

function build() {
  const svc = { checkSlugAvailability: jest.fn().mockResolvedValue({ available: true }), registerTenant: jest.fn().mockResolvedValue({ accessToken: 'AT' }) };
  const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
  return { c: new TenantRegistrationController(svc as never, redis as never), svc, redis };
}
const dto = { slug: 'acme', idempotencyKey: 'key-12345' } as never;

describe('TenantRegistrationController', () => {
  describe('checkSlug', () => {
    it.each([undefined, '', 5 as never])('requires a slug (%p)', async (slug) => {
      const { c, svc } = build();
      expect(await c.checkSlug(slug as never)).toEqual({ available: false, reason: 'Slug is required' });
      expect(svc.checkSlugAvailability).not.toHaveBeenCalled();
    });
    it('normalises case and whitespace', async () => {
      const { c, svc } = build();
      await c.checkSlug('  AcMe ');
      expect(svc.checkSlugAvailability).toHaveBeenCalledWith('acme');
    });
  });

  describe('registerTenant', () => {
    it('returns cached result for a repeated idempotency key without re-registering', async () => {
      const { c, svc, redis } = build();
      redis.get.mockResolvedValue({ accessToken: 'CACHED' });
      expect(await c.registerTenant(dto, '1.1.1.1', 'ua')).toEqual({ accessToken: 'CACHED' });
      expect(redis.get).toHaveBeenCalledWith('', '', 'tenant-reg:idem:acme:key-12345');
      expect(svc.registerTenant).not.toHaveBeenCalled();
    });
    it('registers, then caches for 10 minutes', async () => {
      const { c, svc, redis } = build();
      expect(await c.registerTenant(dto, '1.1.1.1', 'ua')).toEqual({ accessToken: 'AT' });
      expect(svc.registerTenant).toHaveBeenCalledWith(dto, '1.1.1.1', 'ua');
      expect(redis.set).toHaveBeenCalledWith('', '', 'tenant-reg:idem:acme:key-12345', { accessToken: 'AT' }, 600);
    });
    it('defaults ip/user-agent when absent', async () => {
      const { c, svc } = build();
      await c.registerTenant(dto, undefined as never, undefined as never);
      expect(svc.registerTenant).toHaveBeenCalledWith(dto, '0.0.0.0', 'unknown');
    });
    it('tolerates redis outage on read and write', async () => {
      const { c, redis } = build();
      redis.get.mockRejectedValue(new Error('down'));
      redis.set.mockRejectedValue(new Error('down'));
      await expect(c.registerTenant(dto, 'ip', 'ua')).resolves.toEqual({ accessToken: 'AT' });
    });
    it('does not cache failures', async () => {
      const { c, svc, redis } = build();
      svc.registerTenant.mockRejectedValue(new Error('x'));
      await expect(c.registerTenant(dto, 'ip', 'ua')).rejects.toThrow('x');
      expect(redis.set).not.toHaveBeenCalled();
    });
  });
});
