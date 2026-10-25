import { UserRepository } from './user.repository';

jest.mock('@/core/database/tenant-context.service', () => ({ TenantContextService: class TenantContextService {} }));

const roleRow = (userId: string, priority: number | undefined, over: object = {}) => ({
  userId,
  isExpired: false,
  assignedAt: new Date(2025, 0, 1),
  isGuest: false,
  role: priority === undefined ? undefined : { name: `r${priority}`, priority },
  ...over,
});

function build() {
  const txManager = { find: jest.fn(), findOne: jest.fn() };
  const dsManager = { find: jest.fn(), findOne: jest.fn() };
  const ctx = { getQueryRunner: jest.fn().mockReturnValue({ manager: txManager }) };
  const repo = new UserRepository({ manager: dsManager } as never, ctx as never);
  return { repo, txManager, dsManager, ctx };
}

describe('UserRepository', () => {
  it('uses the request-scoped query runner manager when present, else the datasource', async () => {
    const b = build();
    b.txManager.findOne.mockResolvedValue({ id: 'u' });
    await b.repo.findByEmail('a@b.c');
    expect(b.txManager.findOne).toHaveBeenCalledWith(expect.anything(), { where: { email: 'a@b.c' } });
    b.ctx.getQueryRunner.mockReturnValue(undefined);
    b.dsManager.findOne.mockResolvedValue(null);
    expect(await b.repo.findByTenantAndId('t', 'u')).toBeNull();
    expect(b.dsManager.findOne).toHaveBeenCalledWith(expect.anything(), { where: { id: 'u', tenantId: 't' } });
  });

  describe('getMaxRolePriority', () => {
    it('ignores expired and role-less rows, 0 when none', async () => {
      const b = build();
      b.txManager.find.mockResolvedValue([roleRow('u', 900, { isExpired: true }), roleRow('u', 500), roleRow('u', undefined)]);
      expect(await b.repo.getMaxRolePriority('u', 't')).toBe(500);
      b.txManager.find.mockResolvedValue([]);
      expect(await b.repo.getMaxRolePriority('u', 't')).toBe(0);
      expect(b.txManager.find).toHaveBeenCalledWith(expect.anything(), { where: { userId: 'u', tenantId: 't' }, relations: ['role'] });
    });
  });

  describe('getRolePriorities', () => {
    it('returns priorities when every unique id is a tenant role', async () => {
      const b = build();
      b.txManager.find.mockResolvedValue([{ priority: 10 }, { priority: 20 }]);
      expect(await b.repo.getRolePriorities('t', ['a', 'b', 'a'])).toEqual([10, 20]);
      const where = b.txManager.find.mock.calls[0][1].where;
      expect(where.tenantId).toBe('t');
      expect(where.id.value).toEqual(['a', 'b']);
    });
    it('returns null when any role is unknown/foreign', async () => {
      const b = build();
      b.txManager.find.mockResolvedValue([{ priority: 10 }]);
      expect(await b.repo.getRolePriorities('t', ['a', 'evil'])).toBeNull();
    });
  });

  describe('isLastOwnerLevelHolder', () => {
    it.each([
      ['sole owner', [roleRow('u', 900), roleRow('v', 100)], true],
      ['another owner exists', [roleRow('u', 900), roleRow('v', 1000)], false],
      ['other owner expired', [roleRow('u', 900), roleRow('v', 900, { isExpired: true })], true],
      ['user is not an owner', [roleRow('v', 900), roleRow('u', 100)], false],
      ['one user, two owner roles', [roleRow('u', 900), roleRow('u', 1000)], true],
      ['boundary 899 is not owner-level', [roleRow('u', 899)], false],
      ['no assignments', [], false],
    ])('%s -> %s', async (_n, rows, expected) => {
      const b = build();
      b.txManager.find.mockResolvedValue(rows);
      expect(await b.repo.isLastOwnerLevelHolder('u', 't')).toBe(expected);
    });
  });

  describe('getUserOrgs', () => {
    const tenant = { id: 't', name: 'Acme', slug: 'acme', branding: { logoUrl: 'L' } };
    it('empty when no roles or tenant missing', async () => {
      const b = build();
      b.txManager.find.mockResolvedValue([]);
      expect(await b.repo.getUserOrgs('u', 't')).toEqual([]);
      expect(b.dsManager.findOne).not.toHaveBeenCalled();
      b.txManager.find.mockResolvedValue([roleRow('u', 100)]);
      b.dsManager.findOne.mockResolvedValue(null);
      expect(await b.repo.getUserOrgs('u', 't')).toEqual([]);
    });
    it('uses the earliest active role, guest flag and branding logo', async () => {
      const b = build();
      b.dsManager.findOne.mockResolvedValue(tenant);
      b.txManager.find.mockResolvedValue([
        roleRow('u', 500, { assignedAt: new Date(2025, 5, 1) }),
        roleRow('u', 100, { assignedAt: new Date(2025, 0, 1), isGuest: true }),
        roleRow('u', 900, { assignedAt: new Date(2024, 0, 1), isExpired: true }),
      ]);
      expect(await b.repo.getUserOrgs('u', 't')).toEqual([{ tenantId: 't', slug: 'acme', name: 'Acme', role: 'r100', isGuest: true, logoUrl: 'L' }]);
    });
    it('falls back to member when all roles expired; no branding', async () => {
      const b = build();
      b.dsManager.findOne.mockResolvedValue({ ...tenant, branding: undefined });
      b.txManager.find.mockResolvedValue([roleRow('u', 100, { isExpired: true })]);
      expect(await b.repo.getUserOrgs('u', 't')).toEqual([{ tenantId: 't', slug: 'acme', name: 'Acme', role: 'member', isGuest: false, logoUrl: undefined }]);
    });
  });
});
