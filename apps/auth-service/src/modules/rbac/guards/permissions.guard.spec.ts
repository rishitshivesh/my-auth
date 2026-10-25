import { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';

interface Req {
  user?: Record<string, unknown>;
  tenantId?: string;
  ip?: string;
  route?: { path: string };
  path?: string;
  params?: Record<string, string>;
}

const ctx = (req: Req): ExecutionContext =>
  ({
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

function build(required: string[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) };
  const pes = { collectPolicies: jest.fn(), evaluate: jest.fn() };
  const rbac = { userHasPermission: jest.fn() };
  const guard = new PermissionsGuard(reflector as never, pes as never, rbac as never);
  return { guard, pes, rbac, reflector };
}

describe('PermissionsGuard', () => {
  const user = { sub: 'u1' };

  it('allows when no permissions are required', async () => {
    expect(await build(undefined).guard.canActivate(ctx({}))).toBe(true);
    expect(await build([]).guard.canActivate(ctx({}))).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const { guard } = build(['users:read']);
    await expect(guard.canActivate(ctx({ tenantId: 't' }))).rejects.toMatchObject({ code: 'ACCESS_FORBIDDEN' });
    await expect(guard.canActivate(ctx({ user: {}, tenantId: 't' }))).rejects.toMatchObject({ code: 'ACCESS_FORBIDDEN' });
  });

  it('lets super admins through without evaluating policies', async () => {
    const { guard, pes } = build(['users:read']);
    expect(await guard.canActivate(ctx({ user: { sub: 'u', isSuperAdmin: true } }))).toBe(true);
    expect(pes.collectPolicies).not.toHaveBeenCalled();
  });

  it('rejects when tenant context is missing', async () => {
    const { guard } = build(['users:read']);
    await expect(guard.canActivate(ctx({ user }))).rejects.toMatchObject({
      code: 'ACCESS_FORBIDDEN',
      detail: 'Tenant context not found',
    });
  });

  describe('IAM policy path', () => {
    it('allows when every permission evaluates allowed, building ARN-style resource from permission type + id', async () => {
      const { guard, pes } = build(['users:read', 'users:write']);
      pes.collectPolicies.mockResolvedValue([{ id: 'p' }]);
      pes.evaluate.mockResolvedValue({ allowed: true, reason: 'explicit_allow' });
      const req: Req = {
        user: { sub: 'u1', mfaVerified: 1 },
        tenantId: 't1',
        ip: '1.2.3.4',
        route: { path: '/users/:id' },
        params: { id: '42' },
      };
      expect(await guard.canActivate(ctx(req))).toBe(true);
      expect(pes.evaluate).toHaveBeenCalledTimes(2);
      expect(pes.evaluate).toHaveBeenCalledWith({
        userId: 'u1',
        tenantId: 't1',
        action: 'users:read',
        resource: 'sentry:tenant:t1:user:42',
        context: { ipAddress: '1.2.3.4', mfaVerified: true },
      });
    });

    it('uses default ip and wildcard id when no id param; falls back through userId/roleId', async () => {
      const { guard, pes } = build(['a:b']);
      pes.collectPolicies.mockResolvedValue([{ id: 'p' }]);
      pes.evaluate.mockResolvedValue({ allowed: true, reason: 'explicit_allow' });
      await guard.canActivate(ctx({ user, tenantId: 't1', path: '//roles' }));
      expect(pes.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: 'sentry:tenant:t1:a:*',
          context: { ipAddress: '0.0.0.0', mfaVerified: false },
        }),
      );
    });


    it.each([
      [{ userId: 'U' }, 'users:read', 'sentry:tenant:t1:user:U'],
      [{ roleId: 'R' }, 'roles:write', 'sentry:tenant:t1:role:R'],
      [{ id: 'I', userId: 'U' }, 'policies:read', 'sentry:tenant:t1:policy:I'],
      [undefined, 'audit', 'sentry:tenant:t1:audit:*'],
    ])('params %j + %s -> %s', async (params, perm, resource) => {
      const { guard, pes } = build([perm]);
      pes.collectPolicies.mockResolvedValue([{ id: 'p' }]);
      pes.evaluate.mockResolvedValue({ allowed: true, reason: 'explicit_allow' });
      await guard.canActivate(ctx({ user, tenantId: 't1', params }));
      expect(pes.evaluate).toHaveBeenCalledWith(expect.objectContaining({ resource }));
    });

    it('denies on explicit deny and surfaces the deniers', async () => {
      const { guard, pes } = build(['users:read']);
      pes.collectPolicies.mockResolvedValue([{ id: 'p' }]);
      pes.evaluate.mockResolvedValue({ allowed: false, reason: 'explicit_deny', deniedBy: ['P:S1', 'P:S2'] });
      await expect(guard.canActivate(ctx({ user, tenantId: 't', path: '/x' }))).rejects.toMatchObject({
        code: 'ACCESS_FORBIDDEN',
        detail: 'Access denied: explicit_deny (P:S1, P:S2)',
      });
    });

    it('denies on implicit deny with empty deniedBy and stops at first failing permission', async () => {
      const { guard, pes } = build(['a:1', 'a:2']);
      pes.collectPolicies.mockResolvedValue([{ id: 'p' }]);
      pes.evaluate.mockResolvedValue({ allowed: false, reason: 'implicit_deny', deniedBy: [] });
      await expect(guard.canActivate(ctx({ user, tenantId: 't', path: '/x' }))).rejects.toMatchObject({
        detail: 'Access denied: implicit_deny',
      });
      expect(pes.evaluate).toHaveBeenCalledTimes(1);
    });

    it('denies when only the second permission fails', async () => {
      const { guard, pes } = build(['a:1', 'a:2']);
      pes.collectPolicies.mockResolvedValue([{ id: 'p' }]);
      pes.evaluate
        .mockResolvedValueOnce({ allowed: true, reason: 'explicit_allow' })
        .mockResolvedValueOnce({ allowed: false, reason: 'boundary_deny' });
      await expect(guard.canActivate(ctx({ user, tenantId: 't', path: '/x' }))).rejects.toMatchObject({
        code: 'ACCESS_FORBIDDEN',
      });
    });
  });

  describe('legacy role path', () => {
    it('allows when user holds all permissions', async () => {
      const { guard, pes, rbac } = build(['a:1', 'a:2']);
      pes.collectPolicies.mockResolvedValue([]);
      rbac.userHasPermission.mockResolvedValue(true);
      expect(await guard.canActivate(ctx({ user, tenantId: 't' }))).toBe(true);
      expect(rbac.userHasPermission).toHaveBeenCalledWith('u1', 't', 'a:2');
      expect(pes.evaluate).not.toHaveBeenCalled();
    });

    it('denies when any permission is missing', async () => {
      const { guard, pes, rbac } = build(['a:1', 'a:2']);
      pes.collectPolicies.mockResolvedValue([]);
      rbac.userHasPermission.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await expect(guard.canActivate(ctx({ user, tenantId: 't' }))).rejects.toMatchObject({
        code: 'ACCESS_FORBIDDEN',
        detail: 'Access denied: missing permission "a:2"',
      });
    });
  });
});
