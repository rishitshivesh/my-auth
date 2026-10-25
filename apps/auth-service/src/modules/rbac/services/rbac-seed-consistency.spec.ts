import { PermissionService } from './permission.service';
import { RoleService } from './role.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

describe('RBAC seed consistency', () => {
  it('every permission referenced by default roles exists in the seeded catalog', async () => {
    const permRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (x: unknown) => ({ id: 'p', ...(x as object) })),
    };
    const seeded = await new PermissionService(permRepo as never).seedDefaultPermissions('t');
    const catalog = new Set(seeded.map((p) => p.name));

    const roleSvc = new RoleService({} as never, {} as never, {} as never);
    const spy = jest
      .spyOn(roleSvc, 'createRole')
      .mockImplementation(async (d) => ({ id: 'r', name: d.name }) as never);
    await roleSvc.seedDefaultRoles('t');

    const referenced = spy.mock.calls.flatMap(([d]) => d.permissionNames ?? []);
    expect(referenced.length).toBeGreaterThan(0);
    const missing = referenced.filter((n) => !catalog.has(n));
    expect(missing).toEqual([]);
  });
});
