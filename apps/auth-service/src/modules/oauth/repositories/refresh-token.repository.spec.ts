import { IsNull } from 'typeorm';
import { RefreshTokenRepository } from './refresh-token.repository';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function setup(useQueryRunner = false) {
  const mk = () => ({
    findOne: jest.fn().mockResolvedValue('one'),
    find: jest.fn().mockResolvedValue(['a']),
    update: jest.fn().mockResolvedValue({}),
    save: jest.fn(async (_t: unknown, e: unknown) => e),
    create: jest.fn((_t: unknown, d: unknown) => ({ ...(d as object), created: true })),
  });
  const dsManager = mk();
  const qrManager = mk();
  const ds = { manager: dsManager };
  const ctx = { getQueryRunner: jest.fn(() => (useQueryRunner ? { manager: qrManager } : undefined)) };
  const repo = new RefreshTokenRepository(ds as never, ctx as never);
  return { repo, dsManager, qrManager };
}

describe('RefreshTokenRepository', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('uses the request-scoped query runner manager when present', async () => {
    const { repo, qrManager, dsManager } = setup(true);
    await repo.findByToken('h', 't1');
    expect(qrManager.findOne).toHaveBeenCalled();
    expect(dsManager.findOne).not.toHaveBeenCalled();
  });

  it('falls back to the datasource manager', async () => {
    const { repo, dsManager } = setup(false);
    await repo.findByToken('h', 't1');
    expect(dsManager.findOne).toHaveBeenCalled();
  });

  it('findByToken filters by hash AND tenant', async () => {
    const { repo, dsManager } = setup();
    await repo.findByToken('h', 't1');
    expect(dsManager.findOne.mock.calls[0][1]).toEqual({ where: { tokenHash: 'h', tenantId: 't1' } });
  });

  it('findFamily / findActive* scope by tenant and order newest first', async () => {
    const { repo, dsManager } = setup();
    await repo.findFamily('f', 't1');
    await repo.findActiveForSession('s', 't1');
    await repo.findActiveForUser('u', 't1');
    const wheres = dsManager.find.mock.calls.map((c) => c[1].where);
    expect(wheres[0]).toEqual({ familyId: 'f', tenantId: 't1' });
    expect(wheres[1]).toMatchObject({ sessionId: 's', tenantId: 't1', revokedAt: IsNull() });
    expect(wheres[2]).toMatchObject({ userId: 'u', tenantId: 't1', revokedAt: IsNull() });
    dsManager.find.mock.calls.forEach((c) => expect(c[1].order).toEqual({ createdAt: 'DESC' }));
  });

  it.each([
    ['revokeFamily', ['f', 't1'], { familyId: 'f', tenantId: 't1' }, 'family_revoked_reuse_detection'],
    ['revokeByHash', ['h', 't1'], { tokenHash: 'h', tenantId: 't1' }, 'manual_revocation'],
    ['revokeAllForUser', ['u', 't1'], { userId: 'u', tenantId: 't1' }, 'user_logout_all'],
    ['revokeAllForSession', ['s', 't1'], { sessionId: 's', tenantId: 't1' }, 'session_logout'],
  ] as const)('%s revokes with tenant scope and default reason', async (method, args, where, reason) => {
    const { repo, dsManager } = setup();
    await (repo[method] as (...a: string[]) => Promise<void>)(...args);
    const [, crit, data] = dsManager.update.mock.calls[0];
    expect(crit).toMatchObject(where);
    expect(data).toEqual({ revokedAt: NOW, revokedReason: reason });
  });

  it('revoke methods accept a custom reason', async () => {
    const { repo, dsManager } = setup();
    await repo.revokeFamily('f', 't', 'custom');
    expect(dsManager.update.mock.calls[0][2].revokedReason).toBe('custom');
  });

  it('markUsed sets usedAt scoped by id and tenant', async () => {
    const { repo, dsManager } = setup();
    await repo.markUsed('id1', 't1');
    expect(dsManager.update.mock.calls[0][1]).toEqual({ id: 'id1', tenantId: 't1' });
    expect(dsManager.update.mock.calls[0][2]).toEqual({ usedAt: NOW });
  });

  it('createToken creates then saves the entity', async () => {
    const { repo, dsManager } = setup();
    const out = await repo.createToken({ tenantId: 't' } as never);
    expect(dsManager.create).toHaveBeenCalled();
    expect(out).toMatchObject({ created: true, tenantId: 't' });
  });
});
