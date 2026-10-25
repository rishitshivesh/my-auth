import { ApiException } from '../../../common/http';
import { RbacService } from './rbac.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const R = (name: string, priority: number, extra: object = {}) => ({ id: name, name, priority, ...extra });
const ADMIN = R('admin', 900), DEV = R('developer', 500), USER = R('user', 100), SUPER = R('super_admin', 1000);
const ur = (userId: string, role: ReturnType<typeof R>, extra: object = {}) => ({ userId, roleId: role.id, tenantId: 't', role, isExpired: false, ...extra });

function qb(result: unknown[]) {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['where', 'andWhere']) q[m] = jest.fn().mockReturnValue(q);
  q.getMany = jest.fn().mockResolvedValue(result);
  return q;
}

function build(assign: ReturnType<typeof ur>[] = []) {
  const userRepo = { findOne: jest.fn().mockResolvedValue({ id: 'x', email: 'x@x.io' }) };
  const urRepo = {
    find: jest.fn(async ({ where }: { where: { userId?: string; roleId?: string } }) =>
      assign.filter((a) => (!where.userId || a.userId === where.userId) && (!where.roleId || a.roleId === where.roleId)),
    ),
    findOne: jest.fn(async ({ where }: { where: { userId: string; roleId: string } }) =>
      assign.find((a) => a.userId === where.userId && a.roleId === where.roleId) ?? null,
    ),
    save: jest.fn(async (x: unknown) => x),
    remove: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: { transaction: async (cb: () => Promise<unknown>) => cb() },
  };
  const all = [ADMIN, DEV, USER, SUPER];
  const roleSvc = {
    getRole: jest.fn(async (id: string) => {
      const r = all.find((x) => x.id === id);
      if (!r) throw new ApiException('RESOURCE_NOT_FOUND');
      return r;
    }),
    getRoleByName: jest.fn(async (n: string) => all.find((r) => r.name === n) ?? null),
    listRoles: jest.fn(async () => all),
    seedDefaultRoles: jest.fn().mockResolvedValue([1]),
  };
  const permSvc = { seedDefaultPermissions: jest.fn().mockResolvedValue([1, 2]) };
  const svc = new RbacService(userRepo as never, urRepo as never, roleSvc as never, permSvc as never);
  return { svc, userRepo, urRepo, roleSvc, permSvc };
}

describe('RbacService', () => {
  describe('assignRole', () => {
    it('404 when user missing (tenant-scoped lookup)', async () => {
      const b = build();
      b.userRepo.findOne.mockResolvedValue(null);
      await expect(b.svc.assignRole({ userId: 'u', roleId: 'user', tenantId: 't' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      expect(b.userRepo.findOne).toHaveBeenCalledWith({ where: { id: 'u', tenantId: 't' } });
    });
    it('404 when role missing', async () => {
      const b = build();
      await expect(b.svc.assignRole({ userId: 'u', roleId: 'ghost', tenantId: 't' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
    it('creates assignment without actor (no hierarchy check)', async () => {
      const b = build();
      await b.svc.assignRole({ userId: 'u', roleId: 'user', tenantId: 't', reason: 'r' });
      expect(b.urRepo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u', roleId: 'user', reason: 'r' }));
    });
    it('conflict when already assigned and no expiry', async () => {
      const b = build([ur('u', USER)]);
      await expect(b.svc.assignRole({ userId: 'u', roleId: 'user', tenantId: 't' })).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    });
    it('updates expiry on existing assignment', async () => {
      const existing = ur('u', USER);
      const b = build([existing]);
      const exp = new Date('2030-01-01');
      const out = await b.svc.assignRole({ userId: 'u', roleId: 'user', tenantId: 't', expiresAt: exp, reason: 'x', metadata: { a: 1 } });
      expect(out).toMatchObject({ expiresAt: exp, reason: 'x', metadata: { a: 1 } });
    });
    it('hierarchy: super admin may grant admin; developer may not grant developer to a peer-ranked target', async () => {
      const a = build([ur('s', SUPER), ur('t', USER)]);
      await a.svc.assignRole({ userId: 't', roleId: 'admin', tenantId: 't', assignedBy: 's' });
      expect(a.urRepo.save).toHaveBeenCalled();
      const b = build([ur('d', DEV), ur('t', DEV)]);
      await expect(b.svc.assignRole({ userId: 't', roleId: 'user', tenantId: 't', assignedBy: 'd' })).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
    });
    it('self-assignment of a higher role is blocked', async () => {
      const b = build([ur('d', DEV)]);
      await expect(b.svc.assignRole({ userId: 'd', roleId: 'admin', tenantId: 't', assignedBy: 'd' })).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
    });
    it('actor with no roles cannot grant anything', async () => {
      const b = build([ur('t', USER)]);
      await expect(b.svc.assignRole({ userId: 't', roleId: 'user', tenantId: 't', assignedBy: 'nobody' })).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
    });
    it('expired actor roles do not count for rank', async () => {
      const b = build([ur('a', ADMIN, { isExpired: true }), ur('t', USER)]);
      await expect(b.svc.assignRole({ userId: 't', roleId: 'user', tenantId: 't', assignedBy: 'a' })).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
    });
  });

  describe('assignRolesByNames', () => {
    it('assigns many, skipping already-assigned', async () => {
      const b = build([ur('u', USER)]);
      const out = await b.svc.assignRolesByNames({ userId: 'u', roleNames: ['user', 'developer'], tenantId: 't' });
      expect(out).toHaveLength(1);
    });
    it('404 on unknown name; rethrows non-conflict errors', async () => {
      const b = build();
      await expect(b.svc.assignRolesByNames({ userId: 'u', roleNames: ['nope'], tenantId: 't' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      b.userRepo.findOne.mockResolvedValue(null);
      await expect(b.svc.assignRolesByNames({ userId: 'u', roleNames: ['user'], tenantId: 't' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
  });

  describe('removeRole', () => {
    it('404 when assignment missing', async () => {
      const b = build();
      await expect(b.svc.removeRole('u', 'user', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
    it('removes ordinary role, enforcing hierarchy when actor is given', async () => {
      const b = build([ur('u', USER), ur('a', ADMIN)]);
      await b.svc.removeRole('u', 'user', 't', 'a');
      expect(b.urRepo.delete).toHaveBeenCalled();
      const c = build([ur('u', USER), ur('p', USER)]);
      await expect(c.svc.removeRole('u', 'user', 't', 'p')).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
    });
    it('treats missing role relation as priority 0', async () => {
      const b = build([{ userId: 'u', roleId: 'user', tenantId: 't', role: undefined, isExpired: false } as never]);
      await b.svc.removeRole('u', 'user', 't', undefined);
      expect(b.urRepo.delete).toHaveBeenCalled();
    });
    it('LAST_OWNER ignores expired owners', async () => {
      const b = build([ur('a', ADMIN), ur('b', ADMIN, { isExpired: true })]);
      await expect(b.svc.removeRole('a', 'admin', 't')).rejects.toMatchObject({ code: 'LAST_OWNER' });
    });
    it('removeRoleByName 404s on unknown role', async () => {
      const b = build();
      await expect(b.svc.removeRoleByName('u', 'nope', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
  });

  describe('setUserRoles', () => {
    it('replaces roles', async () => {
      const b = build([ur('u', USER), ur('a', ADMIN)]);
      const out = await b.svc.setUserRoles('u', ['developer'], 't', 'a');
      expect(b.urRepo.delete).toHaveBeenCalledWith({ userId: 'u', tenantId: 't' });
      expect(out).toHaveLength(1);
    });
    it('empty list clears roles', async () => {
      const b = build([ur('u', USER), ur('a', ADMIN)]);
      expect(await b.svc.setUserRoles('u', [], 't')).toEqual([]);
      expect(b.urRepo.delete).toHaveBeenCalled();
    });
    it('blocks hierarchy violation before deleting anything', async () => {
      const b = build([ur('u', ADMIN), ur('a', ADMIN), ur('z', ADMIN)]);
      await expect(b.svc.setUserRoles('u', ['user'], 't', 'a')).rejects.toMatchObject({ code: 'HIERARCHY_VIOLATION' });
      expect(b.urRepo.delete).not.toHaveBeenCalled();
    });
    it('keeping an owner-level role passes last-owner check', async () => {
      const b = build([ur('s', SUPER)]);
      await b.svc.setUserRoles('s', ['super_admin'], 't');
      expect(b.urRepo.delete).toHaveBeenCalled();
    });

    it('unknown role name does not strip existing roles', async () => {
      const b = build([ur('u', USER)]);
      await expect(b.svc.setUserRoles('u', ['typo'], 't')).rejects.toBeInstanceOf(ApiException);
      expect(b.urRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('reads', () => {
    it('getUserRoles filters expired', async () => {
      const b = build([ur('u', USER), ur('u', DEV, { isExpired: true })]);
      expect(await b.svc.getUserRoles('u', 't')).toEqual([USER]);
    });
    it('getUserWithRoles 404 / filters expired', async () => {
      const b = build();
      b.userRepo.findOne.mockResolvedValueOnce(null);
      await expect(b.svc.getUserWithRoles('u', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      b.userRepo.findOne.mockResolvedValueOnce({ userRoles: [{ isExpired: true }, { isExpired: false, id: 1 }] });
      expect((await b.svc.getUserWithRoles('u', 't')).userRoles).toEqual([{ isExpired: false, id: 1 }]);
    });
    it('getUserPermissions dedupes across roles and tolerates gaps', async () => {
      const p1 = { id: 'p1' }, p2 = { id: 'p2' };
      const b = build([
        ur('u', R('a', 1, { rolePermissions: [{ permission: p1 }, { permission: null }] })),
        ur('u', R('b', 2, { rolePermissions: [{ permission: p1 }, { permission: p2 }] })),
        ur('u', R('c', 3)),
      ]);
      expect(await b.svc.getUserPermissions('u', 't')).toEqual([p1, p2]);
    });
    it('permission/role predicates delegate to the user entity', async () => {
      const user = {
        userRoles: [],
        hasPermission: jest.fn().mockReturnValue(true),
        hasAnyPermission: jest.fn().mockReturnValue(false),
        hasAllPermissions: jest.fn().mockReturnValue(true),
        hasRole: jest.fn().mockReturnValue(false),
        hasAnyRole: jest.fn().mockReturnValue(true),
        isAdmin: true,
      };
      const b = build();
      b.userRepo.findOne.mockResolvedValue(user);
      expect(await b.svc.userHasPermission('u', 't', 'p')).toBe(true);
      expect(await b.svc.userHasAnyPermission('u', 't', ['p'])).toBe(false);
      expect(await b.svc.userHasAllPermissions('u', 't', ['p'])).toBe(true);
      expect(await b.svc.userHasRole('u', 't', 'r')).toBe(false);
      expect(await b.svc.userHasAnyRole('u', 't', ['r'])).toBe(true);
      expect(await b.svc.userIsAdmin('u', 't')).toBe(true);
    });
  });

  describe('assignDefaultRole', () => {
    it('no-ops when no defaults', async () => {
      const b = build();
      b.roleSvc.listRoles.mockResolvedValue([]);
      await b.svc.assignDefaultRole('u', 't');
      expect(b.urRepo.save).not.toHaveBeenCalled();
    });
    it('assigns defaults, tolerating conflicts, rethrowing others', async () => {
      const b = build([ur('u', USER)]);
      b.roleSvc.listRoles.mockResolvedValue([USER, DEV]);
      await b.svc.assignDefaultRole('u', 't');
      expect(b.urRepo.save).toHaveBeenCalledTimes(1);
      b.userRepo.findOne.mockResolvedValue(null);
      await expect(b.svc.assignDefaultRole('u', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
  });

  it('cleanupExpiredRoles removes expired and returns count', async () => {
    const b = build();
    b.urRepo.createQueryBuilder.mockReturnValue(qb([{ id: 1 }, { id: 2 }]));
    expect(await b.svc.cleanupExpiredRoles('t')).toBe(2);
    expect(b.urRepo.delete).toHaveBeenCalledWith([1, 2]);
    b.urRepo.delete.mockClear();
    b.urRepo.createQueryBuilder.mockReturnValue(qb([]));
    expect(await b.svc.cleanupExpiredRoles('t')).toBe(0);
    expect(b.urRepo.delete).not.toHaveBeenCalled();
  });

  it('getUsersByRole / ByRoleName / getRoleStats', async () => {
    const b = build([
      { ...ur('u1', USER), user: { id: 'u1' } },
      { ...ur('u2', USER, { isExpired: true }), user: { id: 'u2' } },
    ] as never);
    expect(await b.svc.getUsersByRole('user', 't')).toEqual([{ id: 'u1' }]);
    expect(await b.svc.getUsersByRoleName('user', 't')).toEqual([{ id: 'u1' }]);
    await expect(b.svc.getUsersByRoleName('nope', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(await b.svc.getRoleStats('user', 't')).toEqual({ totalUsers: 2, activeUsers: 1, expiredAssignments: 1 });
  });

  it('initializeTenant seeds permissions then roles', async () => {
    const b = build();
    await b.svc.initializeTenant('t', 'me');
    expect(b.permSvc.seedDefaultPermissions).toHaveBeenCalledWith('t');
    expect(b.roleSvc.seedDefaultRoles).toHaveBeenCalledWith('t', 'me');
  });

  it('makeUserAdmin / removeAdminAccess', async () => {
    const b = build([ur('s', SUPER), ur('a', ADMIN)]);
    await b.svc.makeUserAdmin('u', 't', 's');
    expect(b.urRepo.save).toHaveBeenCalledWith(expect.objectContaining({ roleId: 'admin' }));
    await b.svc.removeAdminAccess('a', 't');
    expect(b.urRepo.delete).toHaveBeenCalled();
  });
});
