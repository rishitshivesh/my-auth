import 'reflect-metadata';
import { AuditController } from './audit.controller';
import { PERMISSIONS_KEY } from '@/modules/rbac/guards/permissions.guard';

jest.mock('@/common/decorators/protected.decorator', () => ({ Protected: () => () => undefined }));

describe('AuditController', () => {
  const svc = { list: jest.fn().mockResolvedValue({ items: [] }), exportCsv: jest.fn().mockResolvedValue('csv') };
  const c = new AuditController(svc as never);
  const req = { tenantId: 't1', user: { sub: 'u' } };

  afterEach(() => jest.useRealTimers());

  it('list passes tenant from the request, not the query', async () => {
    expect(await c.listAuditEvents({ userId: 'x' } as never, req)).toEqual({ items: [] });
    expect(svc.list).toHaveBeenCalledWith('t1', { userId: 'x' });
  });

  it('export sets CSV headers and sends body', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const res = { setHeader: jest.fn(), send: jest.fn() };
    await c.exportAuditEvents({} as never, req, res as never);
    expect(svc.exportCsv).toHaveBeenCalledWith('t1', {});
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', `attachment; filename="audit-${Date.now()}.csv"`);
    expect(res.send).toHaveBeenCalledWith('csv');
  });

  it('requires distinct read/export permissions', () => {
    const p = AuditController.prototype as unknown as Record<string, () => void>;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, p.listAuditEvents!)).toEqual(['audit:read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, p.exportAuditEvents!)).toEqual(['audit:export']);
  });
});
