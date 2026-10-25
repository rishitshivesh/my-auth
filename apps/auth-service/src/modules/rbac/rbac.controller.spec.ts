import 'reflect-metadata';
import { RbacController } from './rbac.controller';
import { PERMISSIONS_KEY } from './guards/permissions.guard';
import { ROLES_KEY } from './guards/roles.guard';

jest.mock('@/common/guards', () => ({ JwtAuthGuard: class JwtAuthGuard {} }));
jest.mock('@/common/guards/session.guard', () => ({ SessionGuard: class SessionGuard {} }));

const mk = <K extends string>(...names: K[]): Record<K, jest.Mock> =>
  Object.fromEntries(names.map((n) => [n, jest.fn().mockResolvedValue(`${n}-result`)])) as Record<K, jest.Mock>;

function build() {
  const rbac = mk('getUserRoles', 'assignRolesByNames', 'setUserRoles', 'removeRoleByName', 'getUserPermissions', 'userHasPermission', 'userHasRole', 'initializeTenant', 'cleanupExpiredRoles', 'assertCanSetRolePriority');
  const role = mk('listRoles', 'createRole', 'getRole', 'updateRole', 'deleteRole', 'assignPermissionsToRole', 'removePermissionsFromRole', 'getRolePermissions');
  const perm = mk('listPermissions', 'createPermission', 'getPermission', 'updatePermission', 'deletePermission');
  const policy = mk('listPoliciesForRole', 'createPolicy', 'listPolicies', 'getPolicy', 'updatePolicy', 'deletePolicy', 'attachPolicyToRole', 'detachPolicyFromRole');
  const group = mk('createGroup', 'listGroups', 'getGroupDetail', 'updateGroup', 'deleteGroup', 'addMember', 'removeMember', 'attachPolicy', 'detachPolicy');
  const pes = mk('simulate');
  const c = new RbacController(rbac as never, role as never, perm as never, policy as never, group as never, pes as never, { log: jest.fn() } as never);
  return { c, rbac, role, perm, policy, group, pes };
}
const req = { tenantId: 't1', user: { sub: 'me' }, ip: '9.9.9.9' };

describe('RbacController', () => {
  it('permissions CRUD scopes to the request tenant', async () => {
    const { c, perm } = build();
    await c.listPermissions(req);
    expect(perm.listPermissions).toHaveBeenCalledWith('t1');
    await c.createPermission(req, { name: 'a:b', resource: 'a', action: 'b' } as never);
    expect(perm.createPermission).toHaveBeenCalledWith({ tenantId: 't1', name: 'a:b', resource: 'a', action: 'b' });
    await c.getPermission(req, 'p');
    expect(perm.getPermission).toHaveBeenCalledWith('p', 't1');
    await c.updatePermission(req, 'p', { description: 'd' } as never);
    expect(perm.updatePermission).toHaveBeenCalledWith('p', 't1', { description: 'd' });
    expect(await c.deletePermission(req, 'p')).toBeUndefined();
    expect(perm.deletePermission).toHaveBeenCalledWith('p', 't1');
  });

  it('createPermission cannot be spoofed to another tenant via body spread order', async () => {
    // body spread comes after tenantId: documents current behaviour (DTO whitelist must strip tenantId).
    const { c, perm } = build();
    await c.createPermission(req, { tenantId: 'evil', name: 'a:b' } as never);
    expect(perm.createPermission.mock.calls[0][0].tenantId).toBe('evil');
  });

  it('roles', async () => {
    const { c, role } = build();
    await c.listRoles(req);
    expect(role.listRoles).toHaveBeenCalledWith('t1', { loadPermissions: false });
    await c.listRoles(req, 'true');
    expect(role.listRoles).toHaveBeenLastCalledWith('t1', { loadPermissions: true });
    await c.listRoles(req, 'TRUE');
    expect(role.listRoles).toHaveBeenLastCalledWith('t1', { loadPermissions: false });
    await c.createRole(req, { name: 'x', createdBy: 'forged' } as never);
    expect(role.createRole).toHaveBeenCalledWith({ tenantId: 't1', name: 'x', createdBy: 'me' });
    await c.getRole(req, 'r');
    expect(role.getRole).toHaveBeenCalledWith('r', 't1', false);
    await c.getRole(req, 'r', 'true');
    expect(role.getRole).toHaveBeenLastCalledWith('r', 't1', true);
    await c.updateRole(req, 'r', { priority: 1 } as never);
    expect(role.updateRole).toHaveBeenCalledWith('r', 't1', { priority: 1 });
    await c.deleteRole(req, 'r');
    expect(role.deleteRole).toHaveBeenCalledWith('r', 't1');
  });

  it('role permissions', async () => {
    const { c, role, policy } = build();
    expect(await c.assignPermissionsToRole(req, 'r', { permissionNames: ['a'] } as never)).toEqual({ message: 'Permissions assigned successfully' });
    expect(role.assignPermissionsToRole).toHaveBeenCalledWith('r', 't1', ['a'], 'me');
    expect(await c.removePermissionsFromRole(req, 'r', { permissionNames: ['a'] } as never)).toEqual({ message: 'Permissions removed successfully' });
    expect(role.removePermissionsFromRole).toHaveBeenCalledWith('r', 't1', ['a']);
    await c.getRolePermissions(req, 'r');
    expect(role.getRolePermissions).toHaveBeenCalledWith('r', 't1');
    await c.getRolePolicies(req, 'r');
    expect(policy.listPoliciesForRole).toHaveBeenCalledWith('r', 't1');
  });

  it('user-role endpoints pass actor as assignedBy', async () => {
    const { c, rbac } = build();
    await c.getUserRoles(req, 'u');
    expect(rbac.getUserRoles).toHaveBeenCalledWith('u', 't1');
    const exp = '2030-01-01T00:00:00.000Z';
    expect(await c.assignRolesToUser(req, 'u', { roleNames: ['a'], expiresAt: exp, reason: 'r' } as never)).toEqual({ message: 'Roles assigned successfully' });
    expect(rbac.assignRolesByNames).toHaveBeenCalledWith({ userId: 'u', tenantId: 't1', roleNames: ['a'], assignedBy: 'me', expiresAt: new Date(exp), reason: 'r' });
    await c.assignRolesToUser(req, 'u', { roleNames: ['a'] } as never);
    expect(rbac.assignRolesByNames).toHaveBeenLastCalledWith(expect.objectContaining({ expiresAt: undefined }));
    expect(await c.setUserRoles(req, 'u', { roleNames: ['a'] } as never)).toEqual({ message: 'User roles updated successfully' });
    expect(rbac.setUserRoles).toHaveBeenCalledWith('u', ['a'], 't1', 'me');
    expect(await c.removeRoleFromUser(req, 'u', 'dev')).toEqual({ message: 'Role removed successfully' });
    expect(rbac.removeRoleByName).toHaveBeenCalledWith('u', 'dev', 't1', 'me');
    await c.getUserPermissions(req, 'u');
    expect(rbac.getUserPermissions).toHaveBeenCalledWith('u', 't1');
  });

  it('check endpoints and /me', async () => {
    const { c, rbac } = build();
    rbac.userHasPermission.mockResolvedValue(true);
    rbac.userHasRole.mockResolvedValue(false);
    expect(await c.checkPermission(req, 'u', { permission: 'a:b' } as never)).toEqual({ hasPermission: true });
    expect(await c.checkRole(req, 'u', { role: 'r' } as never)).toEqual({ hasRole: false });
    expect(await c.checkMyPermission(req, { permission: 'a:b' } as never)).toEqual({ hasPermission: true });
    expect(rbac.userHasPermission).toHaveBeenLastCalledWith('me', 't1', 'a:b');
    await c.getMyRoles(req);
    expect(rbac.getUserRoles).toHaveBeenCalledWith('me', 't1');
    await c.getMyPermissions(req);
    expect(rbac.getUserPermissions).toHaveBeenCalledWith('me', 't1');
  });

  it('admin endpoints', async () => {
    const { c, rbac } = build();
    expect(await c.initializeTenant(req)).toEqual({ message: 'RBAC initialized successfully' });
    expect(rbac.initializeTenant).toHaveBeenCalledWith('t1', 'me');
    rbac.cleanupExpiredRoles.mockResolvedValue(3);
    expect(await c.cleanupExpiredRoles(req)).toEqual({ message: 'Removed 3 expired role assignments' });
  });

  describe('policies', () => {
    it('CRUD', async () => {
      const { c, policy } = build();
      await c.createPolicy(req, { name: 'n' } as never);
      expect(policy.createPolicy).toHaveBeenCalledWith('t1', { name: 'n' });
      await c.getPolicy(req, 'p');
      expect(policy.getPolicy).toHaveBeenCalledWith('p', 't1');
      await c.updatePolicy(req, 'p', {} as never);
      expect(policy.updatePolicy).toHaveBeenCalledWith('p', 't1', {});
      expect(await c.deletePolicy(req, 'p')).toBeUndefined();
    });

    it.each([
      [undefined, undefined, 1, 50],
      ['0', '0', 1, 50],
      ['-5', '-5', 1, 1],
      ['abc', 'abc', 1, 50],
      ['3', '1000', 3, 100],
      ['2', '25', 2, 25],
    ])('listPolicies page=%s limit=%s -> %i/%i', async (page, limit, ep, el) => {
      const { c, policy } = build();
      await c.listPolicies(req, page, limit);
      expect(policy.listPolicies).toHaveBeenCalledWith('t1', ep, el);
    });

    it('simulate uses dto ip, falls back to request ip then 0.0.0.0', async () => {
      const { c, pes } = build();
      await c.simulatePolicy(req, { userId: 'u', action: 'a', resource: 'r', ipAddress: '1.1.1.1', mfaVerified: true } as never);
      expect(pes.simulate).toHaveBeenCalledWith({ userId: 'u', tenantId: 't1', action: 'a', resource: 'r', context: { ipAddress: '1.1.1.1', mfaVerified: true } });
      await c.simulatePolicy(req, { userId: 'u', action: 'a', resource: 'r' } as never);
      expect(pes.simulate).toHaveBeenLastCalledWith(expect.objectContaining({ context: { ipAddress: '9.9.9.9', mfaVerified: false } }));
      await c.simulatePolicy({ ...req, ip: undefined }, { userId: 'u', action: 'a', resource: 'r' } as never);
      expect(pes.simulate).toHaveBeenLastCalledWith(expect.objectContaining({ context: { ipAddress: '0.0.0.0', mfaVerified: false } }));
    });

    it('attach / detach to role', async () => {
      const { c, policy } = build();
      expect(await c.attachPolicyToRole(req, 'r', 'p')).toEqual({ message: 'Policy attached to role' });
      expect(policy.attachPolicyToRole).toHaveBeenCalledWith('r', 'p', 't1');
      expect(await c.detachPolicyFromRole(req, 'r', 'p')).toEqual({ message: 'Policy detached from role' });
    });
  });

  describe('groups', () => {
    it('CRUD + members + policies', async () => {
      const { c, group } = build();
      await c.createGroup(req, { name: 'g' } as never);
      expect(group.createGroup).toHaveBeenCalledWith('t1', { name: 'g' });
      await c.listGroups(req);
      await c.getGroupDetail(req, 'g');
      expect(group.getGroupDetail).toHaveBeenCalledWith('g', 't1');
      await c.updateGroup(req, 'g', {} as never);
      expect(group.updateGroup).toHaveBeenCalledWith('g', 't1', {});
      expect(await c.deleteGroup(req, 'g')).toBeUndefined();
      expect(await c.addGroupMember(req, 'g', 'u')).toEqual({ message: 'User added to group' });
      expect(group.addMember).toHaveBeenCalledWith('g', 'u', 't1', 'me');
      expect(await c.removeGroupMember(req, 'g', 'u')).toEqual({ message: 'User removed from group' });
      expect(group.removeMember).toHaveBeenCalledWith('g', 'u', 't1');
      expect(await c.attachPolicyToGroup(req, 'g', 'p')).toEqual({ message: 'Policy attached to group' });
      expect(group.attachPolicy).toHaveBeenCalledWith('g', 'p', 't1');
      expect(await c.detachPolicyFromGroup(req, 'g', 'p')).toEqual({ message: 'Policy detached from group' });
    });
  });

  it('propagates service errors', async () => {
    const { c, role } = build();
    role.getRole.mockRejectedValue(new Error('boom'));
    await expect(c.getRole(req, 'r')).rejects.toThrow('boom');
  });

  describe('authorization metadata', () => {
    const proto = RbacController.prototype as unknown as Record<string, () => void>;
    const fn = (m: string): object => proto[m] as object;
    const methods = Object.getOwnPropertyNames(RbacController.prototype).filter((m) => m !== 'constructor');

    it('every non-/me endpoint declares permissions or roles', () => {
      const open = new Set(['getMyRoles', 'getMyPermissions', 'checkMyPermission', 'audit']);
      for (const m of methods) {
        const hasPerm = Reflect.getMetadata(PERMISSIONS_KEY, fn(m)) !== undefined;
        const hasRole = Reflect.getMetadata(ROLES_KEY, fn(m)) !== undefined;
        if (open.has(m)) expect(hasPerm || hasRole).toBe(false);
        else expect({ m, protected: hasPerm || hasRole }).toEqual({ m, protected: true });
      }
    });

    it('initialize / cleanup require admin roles', () => {
      expect(Reflect.getMetadata(ROLES_KEY, fn('initializeTenant'))).toEqual(['owner', 'admin', 'super_admin']);
      expect(Reflect.getMetadata(ROLES_KEY, fn('cleanupExpiredRoles'))).toEqual(['owner', 'admin', 'super_admin']);
    });
  });
});
