import 'reflect-metadata';
import { UserController } from './user.controller';
import { PERMISSIONS_KEY } from '../rbac/guards/permissions.guard';

jest.mock('./user.service', () => ({ UserService: class UserService {} }));
jest.mock('./user.repository', () => ({ UserRepository: class UserRepository {} }));
jest.mock('@/modules/session/session-management.service', () => ({ SessionManagementService: class SessionManagementService {} }));
jest.mock('@/common/guards', () => ({ JwtAuthGuard: class JwtAuthGuard {}, RequireRecentAuth: () => () => undefined }));
jest.mock('@/common/decorators/protected.decorator', () => ({ Protected: () => () => undefined }));
jest.mock('./user.dto', () => ({
  UpdateUserDto: class {}, ChangePasswordDto: class {}, UserStatsDto: class {}, ListUsersQueryDto: class {},
  BulkUpdateUsersDto: class {}, ListUsersResponseDto: class {}, InviteUserDto: class {},
}));

const mk = <K extends string>(...names: K[]): Record<K, jest.Mock> =>
  Object.fromEntries(names.map((n) => [n, jest.fn().mockResolvedValue(`${n}-r`)])) as Record<K, jest.Mock>;

function build() {
  const users = mk('findById', 'update', 'changePassword', 'getActiveSessions', 'revokeSession', 'revokeAllSessions', 'getSecurityEvents', 'getUserOrgs', 'deleteAccount', 'listUsers', 'getUserStats', 'exportUsers', 'bulkUpdateActiveStatus', 'adminUpdate', 'adminDeleteUser', 'adminForcePasswordReset', 'adminLockUser', 'adminUnlockUser', 'inviteUser', 'listPendingInvites', 'revokeInvite');
  const sessions = mk('getActiveSessions', 'revokeSession');
  return { c: new UserController(users as never, sessions as never), users, sessions };
}
const req = { tenantId: 't1', user: { sub: 'me', sessionId: 'sid' }, requestId: 'rq', ip: '2.2.2.2', headers: { 'user-agent': 'UA' } };

describe('UserController', () => {
  it('own-profile endpoints are scoped to the caller and tenant', async () => {
    const { c, users } = build();
    expect(await c.getProfile(req)).toBe('findById-r');
    expect(users.findById).toHaveBeenCalledWith('t1', 'me');
    expect(await c.updateProfile(req, { firstName: 'A' } as never)).toEqual({ message: 'Profile updated successfully' });
    expect(users.update).toHaveBeenCalledWith('t1', 'me', { firstName: 'A' });
    await c.getSessions(req);
    expect(users.getActiveSessions).toHaveBeenCalledWith('t1', 'me');
    expect(await c.revokeSession(req, 's9')).toEqual({ message: 'Session revoked successfully' });
    expect(users.revokeSession).toHaveBeenCalledWith('t1', 'me', 's9');
    expect(await c.revokeAllSessions(req)).toEqual({ message: 'All other sessions revoked successfully' });
    expect(users.revokeAllSessions).toHaveBeenCalledWith('t1', 'me', 'sid');
    await c.getUserOrgs(req);
    expect(users.getUserOrgs).toHaveBeenCalledWith('me', 't1');
  });

  it('revokeAllSessions keeps the current session', async () => {
    const { c, users } = build();
    await c.revokeAllSessions(req);
    expect(users.revokeAllSessions).toHaveBeenCalledWith('t1', 'me', 'sid');
  });

  it('changePassword forwards request context with defaults', async () => {
    const { c, users } = build();
    expect(await c.changePassword(req, { currentPassword: 'a', newPassword: 'b' } as never)).toEqual({ message: 'Password changed successfully' });
    expect(users.changePassword).toHaveBeenCalledWith('t1', 'me', 'a', 'b', { ip: '2.2.2.2', userAgent: 'UA', requestId: 'rq', sessionId: 'sid' });
    await c.changePassword({ tenantId: 't1', user: { sub: 'me' } }, { currentPassword: 'a', newPassword: 'b' } as never);
    expect(users.changePassword).toHaveBeenLastCalledWith('t1', 'me', 'a', 'b', { ip: '0.0.0.0', userAgent: 'unknown', requestId: undefined, sessionId: undefined });
  });

  it('security events parse limit', async () => {
    const { c, users } = build();
    await c.getSecurityEvents(req);
    expect(users.getSecurityEvents).toHaveBeenLastCalledWith('t1', 'me', 50);
    await c.getSecurityEvents(req, '7');
    expect(users.getSecurityEvents).toHaveBeenLastCalledWith('t1', 'me', 7);
    await c.getUserSecurityEvents(req, 'other', '9');
    expect(users.getSecurityEvents).toHaveBeenLastCalledWith('t1', 'other', 9);
    await c.getUserSecurityEvents(req, 'other');
    expect(users.getSecurityEvents).toHaveBeenLastCalledWith('t1', 'other', 50);
  });

  it('limit is clamped to a sane range', async () => {
    const { c, users } = build();
    await c.getSecurityEvents(req, 'abc');
    expect(users.getSecurityEvents.mock.calls[0]![2]).toBe(50);
    await c.getSecurityEvents(req, '-1');
    expect(users.getSecurityEvents.mock.calls[1]![2]).toBe(1);
    await c.getSecurityEvents(req, '1000000');
    expect(users.getSecurityEvents.mock.calls[2]![2]).toBe(100);
  });

  it('deleteAccount passes password and request id', async () => {
    const { c, users } = build();
    expect(await c.deleteAccount(req, 'pw')).toEqual({ message: 'Account deleted successfully' });
    expect(users.deleteAccount).toHaveBeenCalledWith('t1', 'me', 'pw', 'rq');
  });

  describe('admin endpoints', () => {
    it('listUsers / exportUsers convert date strings', async () => {
      const { c, users } = build();
      await c.listUsers(req, { page: 2, createdAfter: '2025-01-01', createdBefore: '2025-02-01' } as never);
      expect(users.listUsers).toHaveBeenCalledWith('t1', { page: 2, createdAfter: new Date('2025-01-01'), createdBefore: new Date('2025-02-01') });
      await c.listUsers(req, {} as never);
      expect(users.listUsers).toHaveBeenLastCalledWith('t1', { createdAfter: undefined, createdBefore: undefined });
      await c.exportUsers(req, { createdAfter: '2025-01-01' } as never);
      expect(users.exportUsers).toHaveBeenCalledWith('t1', { createdAfter: new Date('2025-01-01'), createdBefore: undefined });
      await c.getUserStats(req);
      expect(users.getUserStats).toHaveBeenCalledWith('t1');
    });
    it('bulkUpdateStatus reports count', async () => {
      const { c, users } = build();
      users.bulkUpdateActiveStatus.mockResolvedValue({ updated: 3 });
      expect(await c.bulkUpdateStatus(req, { userIds: ['a'], isActive: false } as never)).toEqual({ message: 'Successfully updated 3 users', updated: 3 });
      expect(users.bulkUpdateActiveStatus).toHaveBeenCalledWith('t1', ['a'], false, 'me');
    });
    it('by-id operations pass actor for hierarchy checks', async () => {
      const { c, users } = build();
      await c.getUserById(req, 'x');
      expect(users.findById).toHaveBeenCalledWith('t1', 'x');
      expect(await c.updateUser(req, 'x', { firstName: 'Z' } as never)).toEqual({ message: 'User updated successfully' });
      expect(users.adminUpdate).toHaveBeenCalledWith('t1', 'x', 'me', { firstName: 'Z' });
      expect(await c.deleteUser(req, 'x')).toBeUndefined();
      expect(users.adminDeleteUser).toHaveBeenCalledWith('t1', 'x', 'me', 'rq');
      expect(await c.forcePasswordReset(req, 'x')).toEqual({ message: 'User will be required to reset password on next login' });
      expect(users.adminForcePasswordReset).toHaveBeenCalledWith('t1', 'x', 'me');
      expect(await c.lockUser(req, 'x')).toEqual({ message: 'User account locked' });
      expect(users.adminLockUser).toHaveBeenCalledWith('t1', 'x', 'me');
      expect(await c.unlockUser(req, 'x')).toEqual({ message: 'User account unlocked' });
      expect(users.adminUnlockUser).toHaveBeenCalledWith('t1', 'x', 'me');
    });
    it('invite delegates with inviter id', async () => {
      const { c, users } = build();
      await c.inviteUser(req, { email: 'a@b.c' } as never);
      expect(users.inviteUser).toHaveBeenCalledWith('t1', 'me', { email: 'a@b.c' });
    });
    it('lists and revokes invites scoped to the caller tenant', async () => {
      const { c, users } = build();
      await c.listInvites(req);
      expect(users.listPendingInvites).toHaveBeenCalledWith('t1');
      await c.revokeInvite(req, 'inv1');
      expect(users.revokeInvite).toHaveBeenCalledWith('t1', 'inv1', expect.objectContaining({ userId: 'me' }));
    });
    it('session administration uses SessionManagementService with tenant', async () => {
      const { c, sessions } = build();
      await c.getUserSessions(req, 'x');
      expect(sessions.getActiveSessions).toHaveBeenCalledWith('x', 't1');
      expect(await c.revokeUserSession(req, 'x', 's1')).toBeUndefined();
      expect(sessions.revokeSession).toHaveBeenCalledWith('s1', 'x', 't1', 'admin_revoked');
    });
    it('propagates service errors', async () => {
      const { c, users } = build();
      users.findById.mockRejectedValue(new Error('nf'));
      await expect(c.getUserById(req, 'x')).rejects.toThrow('nf');
    });
  });

  it('every admin endpoint declares a permission; own-profile endpoints do not', () => {
    const proto = UserController.prototype as unknown as Record<string, () => void>;
    const own = new Set(['getProfile', 'updateProfile', 'changePassword', 'getSessions', 'revokeSession', 'revokeAllSessions', 'getSecurityEvents', 'getUserOrgs', 'deleteAccount']);
    const perm = (m: string) => Reflect.getMetadata(PERMISSIONS_KEY, proto[m] as object);
    for (const m of Object.getOwnPropertyNames(UserController.prototype).filter((n) => n !== 'constructor')) {
      if (own.has(m)) expect({ m, perm: perm(m) }).toEqual({ m, perm: undefined });
      else expect({ m, has: perm(m) !== undefined }).toEqual({ m, has: true });
    }
    expect(perm('deleteUser')).toEqual(['users:delete']);
  });
});
