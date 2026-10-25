import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

const ctx = (req: Record<string, unknown>): ExecutionContext =>
  ({
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

function build(required: string[] | undefined, has = true) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) };
  const rbac = { userHasAnyRole: jest.fn().mockResolvedValue(has) };
  return { guard: new RolesGuard(reflector as never, rbac as never), rbac };
}

describe('RolesGuard', () => {
  it('allows when no roles are required', async () => {
    expect(await build(undefined).guard.canActivate(ctx({}))).toBe(true);
    expect(await build([]).guard.canActivate(ctx({}))).toBe(true);
  });

  it('rejects unauthenticated users', async () => {
    const { guard } = build(['admin']);
    await expect(guard.canActivate(ctx({ tenantId: 't' }))).rejects.toMatchObject({ code: 'ACCESS_FORBIDDEN' });
    await expect(guard.canActivate(ctx({ user: {}, tenantId: 't' }))).rejects.toMatchObject({ code: 'ACCESS_FORBIDDEN' });
  });

  it('allows super admins without a role lookup', async () => {
    const { guard, rbac } = build(['admin']);
    expect(await guard.canActivate(ctx({ user: { sub: 'u', isSuperAdmin: true } }))).toBe(true);
    expect(rbac.userHasAnyRole).not.toHaveBeenCalled();
  });

  it('rejects when tenant context is missing', async () => {
    const { guard } = build(['admin']);
    await expect(guard.canActivate(ctx({ user: { sub: 'u' } }))).rejects.toMatchObject({
      detail: 'Tenant context not found',
    });
  });

  it('allows when the user has any required role', async () => {
    const { guard, rbac } = build(['admin', 'dev']);
    expect(await guard.canActivate(ctx({ user: { sub: 'u' }, tenantId: 't' }))).toBe(true);
    expect(rbac.userHasAnyRole).toHaveBeenCalledWith('u', 't', ['admin', 'dev']);
  });

  it('denies and lists required roles when none match', async () => {
    const { guard } = build(['admin', 'dev'], false);
    await expect(guard.canActivate(ctx({ user: { sub: 'u' }, tenantId: 't' }))).rejects.toMatchObject({
      code: 'ACCESS_FORBIDDEN',
      detail: 'Missing required role. Required one of: admin, dev',
    });
  });
});
