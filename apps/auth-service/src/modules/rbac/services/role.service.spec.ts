import { ApiException } from '../../../common/http';
import { RoleService } from './role.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

function qb(result: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['where', 'andWhere', 'leftJoinAndSelect', 'orderBy', 'addOrderBy']) q[m] = jest.fn().mockReturnValue(q);
  q.getOne = jest.fn().mockResolvedValue(result);
  q.getMany = jest.fn().mockResolvedValue(result);
  return q;
}
function build() {
  const role = { findOne: jest.fn(), save: jest.fn(async (x: unknown) => ({ id: 'r1', ...(x as object) })), delete: jest.fn(), createQueryBuilder: jest.fn() };
  const rp: Record<string, unknown> = { find: jest.fn().mockResolvedValue([]), save: jest.fn(), delete: jest.fn() };
  rp.manager = { transaction: async (cb: (m: unknown) => Promise<unknown>) => cb({ getRepository: () => rp }) };
  const perm = { find: jest.fn().mockResolvedValue([]) };
  const rpm = rp as unknown as { find: jest.Mock; save: jest.Mock; delete: jest.Mock };
  return { svc: new RoleService(role as never, rp as never, perm as never), role, rp: rpm, perm };
}

describe('RoleService', () => {
  describe('createRole', () => {
    it('conflicts when name exists in tenant', async () => {
      const { svc, role } = build();
      role.findOne.mockResolvedValue({});
      await expect(svc.createRole({ tenantId: 't', name: 'x' })).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
      expect(role.findOne).toHaveBeenCalledWith({ where: { tenantId: 't', name: 'x' } });
    });

    it('applies defaults and skips permission assignment without names', async () => {
      const { svc, role, rp } = build();
      role.findOne.mockResolvedValue(null);
      await svc.createRole({ tenantId: 't', name: 'x', permissionNames: [] });
      expect(role.save).toHaveBeenCalledWith(expect.objectContaining({ scope: 'tenant', isSystem: false, isActive: true, isDefault: false, priority: 0 }));
      expect(rp.save).not.toHaveBeenCalled();
    });

    it('assigns permissions when provided', async () => {
      const { svc, role, perm, rp } = build();
      role.findOne.mockResolvedValue(null);
      role.createQueryBuilder.mockReturnValue(qb({ id: 'r1', isSystem: false, name: 'x' }));
      perm.find.mockResolvedValue([{ id: 'p1', name: 'a:b' }]);
      await svc.createRole({ tenantId: 't', name: 'x', scope: 's', priority: 5, isDefault: true, createdBy: 'me', permissionNames: ['a:b'] });
      expect(rp.save).toHaveBeenCalledWith([expect.objectContaining({ roleId: 'r1', permissionId: 'p1', assignedBy: 'me', tenantId: 't' })]);
    });
  });

  describe('reserved role names', () => {
    it.each(['super_admin', ' Super_Admin ', 'sentry-internal', 'billing-internal', 'X-INTERNAL'])('rejects %p', async (name) => {
      const { svc, role } = build();
      await expect(svc.createRole({ tenantId: 't', name })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(role.save).not.toHaveBeenCalled();
    });
  });

  describe('getRole / getRoleByName', () => {
    it('scopes by tenant, optional joins, throws when missing', async () => {
      const { svc, role } = build();
      const q = qb({ id: 'r' });
      role.createQueryBuilder.mockReturnValue(q);
      await svc.getRole('r', 't');
      expect(q.andWhere).toHaveBeenCalledWith('role.tenantId = :tenantId', { tenantId: 't' });
      expect(q.leftJoinAndSelect).not.toHaveBeenCalled();
      await svc.getRole('r', 't', true);
      expect(q.leftJoinAndSelect).toHaveBeenCalledTimes(2);
      role.createQueryBuilder.mockReturnValue(qb(null));
      await expect(svc.getRole('r', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });
    it('getRoleByName returns null when missing', async () => {
      const { svc, role } = build();
      role.createQueryBuilder.mockReturnValue(qb(null));
      expect(await svc.getRoleByName('n', 't')).toBeNull();
      const q = qb({ id: 1 });
      role.createQueryBuilder.mockReturnValue(q);
      await svc.getRoleByName('n', 't', true);
      expect(q.leftJoinAndSelect).toHaveBeenCalledTimes(2);
    });
  });

  it('listRoles applies each filter, including false values', async () => {
    const { svc, role } = build();
    const q = qb([1]);
    role.createQueryBuilder.mockReturnValue(q);
    expect(await svc.listRoles('t')).toEqual([1]);
    expect(q.andWhere).not.toHaveBeenCalled();
    await svc.listRoles('t', { isActive: false, isSystem: false, isDefault: false, loadPermissions: true });
    expect(q.andWhere).toHaveBeenCalledTimes(3);
    expect(q.andWhere).toHaveBeenCalledWith('role.isActive = :isActive', { isActive: false });
    expect(q.leftJoinAndSelect).toHaveBeenCalledTimes(2);
    expect(q.orderBy).toHaveBeenCalledWith('role.priority', 'DESC');
  });

  describe('updateRole / deleteRole', () => {
    it('update rejects system role, otherwise merges', async () => {
      const { svc, role } = build();
      role.createQueryBuilder.mockReturnValue(qb({ isSystem: true }));
      await expect(svc.updateRole('r', 't', { priority: 1 })).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
      role.createQueryBuilder.mockReturnValue(qb({ name: 'n', isSystem: false }));
      expect(await svc.updateRole('r', 't', { displayName: 'D' })).toMatchObject({ displayName: 'D' });
      expect(role.save).toHaveBeenCalled();
    });
    it('delete rejects system and default roles, otherwise removes', async () => {
      const { svc, role } = build();
      role.createQueryBuilder.mockReturnValue(qb({ isSystem: true }));
      await expect(svc.deleteRole('r', 't')).rejects.toMatchObject({ detail: 'Cannot delete system role' });
      role.createQueryBuilder.mockReturnValue(qb({ isDefault: true }));
      await expect(svc.deleteRole('r', 't')).rejects.toMatchObject({ detail: 'Cannot delete default role' });
      role.createQueryBuilder.mockReturnValue(qb({ name: 'n' }));
      await svc.deleteRole('r', 't');
      expect(role.delete).toHaveBeenCalled();
    });
  });

  describe('permission assignment', () => {
    const live = (b: ReturnType<typeof build>) => b.role.createQueryBuilder.mockReturnValue(qb({ id: 'r', name: 'n', isSystem: false }));

    it('assign rejects system role', async () => {
      const b = build();
      b.role.createQueryBuilder.mockReturnValue(qb({ isSystem: true }));
      await expect(b.svc.assignPermissionsToRole('r', 't', ['a'])).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    });
    it('assign rejects unknown permission names listing the missing ones', async () => {
      const b = build();
      live(b);
      b.perm.find.mockResolvedValue([{ id: 'p1', name: 'a' }]);
      await expect(b.svc.assignPermissionsToRole('r', 't', ['a', 'b', 'c'])).rejects.toMatchObject({ code: 'BAD_REQUEST', detail: 'Permissions not found: b, c' });
      expect(b.rp.save).not.toHaveBeenCalled();
    });
    it('assign only adds permissions not yet held', async () => {
      const b = build();
      live(b);
      b.perm.find.mockResolvedValue([{ id: 'p1', name: 'a' }, { id: 'p2', name: 'b' }]);
      b.rp.find.mockResolvedValue([{ permissionId: 'p1' }]);
      await b.svc.assignPermissionsToRole('r', 't', ['a', 'b']);
      expect(b.rp.save).toHaveBeenCalledWith([expect.objectContaining({ permissionId: 'p2' })]);
    });
    it('assign is a no-op when all already held', async () => {
      const b = build();
      live(b);
      b.perm.find.mockResolvedValue([{ id: 'p1', name: 'a' }]);
      b.rp.find.mockResolvedValue([{ permissionId: 'p1' }]);
      await b.svc.assignPermissionsToRole('r', 't', ['a']);
      expect(b.rp.save).not.toHaveBeenCalled();
    });
    it('remove rejects system role, otherwise deletes by ids', async () => {
      const b = build();
      b.role.createQueryBuilder.mockReturnValue(qb({ isSystem: true }));
      await expect(b.svc.removePermissionsFromRole('r', 't', ['a'])).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
      live(b);
      b.perm.find.mockResolvedValue([{ id: 'p1' }]);
      await b.svc.removePermissionsFromRole('r', 't', ['a']);
      expect(b.rp.delete).toHaveBeenCalledWith(expect.objectContaining({ roleId: 'r', tenantId: 't' }));
    });
    it('setRolePermissions rejects system; replaces; empty list only clears', async () => {
      const b = build();
      b.role.createQueryBuilder.mockReturnValue(qb({ isSystem: true }));
      await expect(b.svc.setRolePermissions('r', 't', [])).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
      live(b);
      await b.svc.setRolePermissions('r', 't', []);
      expect(b.rp.delete).toHaveBeenCalledWith({ roleId: 'r', tenantId: 't' });
      expect(b.perm.find).not.toHaveBeenCalled();
      b.perm.find.mockResolvedValue([{ id: 'p1', name: 'a' }]);
      await b.svc.setRolePermissions('r', 't', ['a'], 'me');
      expect(b.rp.save).toHaveBeenCalled();
    });

    it('setRolePermissions with unknown name does not wipe existing permissions', async () => {
      const b = build();
      live(b);
      b.perm.find.mockResolvedValue([]);
      await expect(b.svc.setRolePermissions('r', 't', ['nope'])).rejects.toBeInstanceOf(ApiException);
      expect(b.rp.delete).not.toHaveBeenCalled();
    });
  });

  it('getRolePermissions maps relation', async () => {
    const { svc, rp } = build();
    rp.find.mockResolvedValue([{ permission: { id: 1 } }]);
    expect(await svc.getRolePermissions('r', 't')).toEqual([{ id: 1 }]);
  });

  describe('seedDefaultRoles', () => {
    it('skips conflicts and rethrows other errors', async () => {
      const a = build();
      jest.spyOn(a.svc, 'createRole').mockRejectedValue(new ApiException('RESOURCE_CONFLICT'));
      expect(await a.svc.seedDefaultRoles('t')).toEqual([]);
      const b = build();
      jest.spyOn(b.svc, 'createRole').mockRejectedValue(new Error('db'));
      await expect(b.svc.seedDefaultRoles('t')).rejects.toThrow('db');
    });

    // Seeded system roles (admin) get their permissions via the internal attach path, not the guarded public one.
    it('seeds system roles with their permissions on a fresh tenant', async () => {
      const b = build();
      b.role.findOne.mockResolvedValue(null);
      b.role.save.mockImplementation(async (x: unknown) => ({ id: 'r', ...(x as object) }));
      b.role.createQueryBuilder.mockImplementation(() => qb({ id: 'r', name: 'n', isSystem: true }));
      b.perm.find.mockImplementation(async ({ where }: { where: { name: { value: string[] } } }) => where.name.value.map((n, i) => ({ id: `p${i}`, name: n })));
      const roles = await b.svc.seedDefaultRoles('t', 'me');
      expect(roles).toHaveLength(3); // admin (system), developer, user
    });
  });
});
