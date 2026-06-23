import { RbacController } from './rbac.controller';
import { Permissions } from './constants/permissions.catalog';

describe('RbacController — permission boundary (T-009)', () => {
  it('check-permission endpoint requires USERS_READ permission metadata', () => {
    const required = Reflect.getMetadata(
      'permissions',
      RbacController.prototype.checkPermission,
    );
    expect(required).toBeDefined();
    expect(required).toContain(Permissions.USERS_READ);
  });

  it('check-role endpoint requires USERS_READ permission metadata', () => {
    const required = Reflect.getMetadata(
      'permissions',
      RbacController.prototype.checkRole,
    );
    expect(required).toBeDefined();
    expect(required).toContain(Permissions.USERS_READ);
  });
});
