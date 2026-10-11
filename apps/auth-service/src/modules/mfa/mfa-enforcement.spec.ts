import { MfaPolicyService } from './mfa-policy.service';
import { MfaService } from './mfa.service';
import { TenantMfaPolicy } from '@repo/database';

const makeMfaStubs = () => ({
  mfaService: {
    getMfaStatus: jest.fn(),
  } as Partial<MfaService>,
  mfaPolicyService: {
    getForTenant: jest.fn(),
    issueEnrollmentToken: jest.fn().mockResolvedValue('enroll-token-abc'),
  } as Partial<MfaPolicyService>,
  userRoleRepo: {
    find: jest.fn(),
  },
});

describe('MFA enrollment enforcement (T-008)', () => {
  describe('enforcement branching logic', () => {
    it('T-008a: enforceForAllUsers=true + no MFA → needsEnrollment is true', async () => {
      const stubs = makeMfaStubs();
      (stubs.mfaService.getMfaStatus as jest.Mock).mockResolvedValue({ enabled: false, methods: [] });
      (stubs.mfaPolicyService.getForTenant as jest.Mock).mockResolvedValue({
        enforceForAllUsers: true,
        enforceForAdmins: false,
      } as Partial<TenantMfaPolicy>);
      stubs.userRoleRepo.find.mockResolvedValue([]);

      const mfaStatus = await stubs.mfaService.getMfaStatus!('user-1', 'tenant-1');
      const policy = await stubs.mfaPolicyService.getForTenant!('tenant-1');
      const roles: Array<{ role: { name: string } }> = await stubs.userRoleRepo.find();
      const isAdminOrOwner = roles.some((ur) => ['owner', 'admin'].includes(ur.role.name.toLowerCase()));

      const needsEnrollment =
        !mfaStatus.enabled &&
        (policy.enforceForAllUsers || (policy.enforceForAdmins && isAdminOrOwner));

      expect(needsEnrollment).toBe(true);

      const token = await stubs.mfaPolicyService.issueEnrollmentToken!('user-1', 'tenant-1');
      expect(token).toBe('enroll-token-abc');
    });

    it('T-008b: enforceForAdmins=true + owner role → needsEnrollment is true', async () => {
      const stubs = makeMfaStubs();
      (stubs.mfaService.getMfaStatus as jest.Mock).mockResolvedValue({ enabled: false, methods: [] });
      (stubs.mfaPolicyService.getForTenant as jest.Mock).mockResolvedValue({
        enforceForAllUsers: false,
        enforceForAdmins: true,
      } as Partial<TenantMfaPolicy>);
      stubs.userRoleRepo.find.mockResolvedValue([{ role: { name: 'owner' } }]);

      const mfaStatus = await stubs.mfaService.getMfaStatus!('user-1', 'tenant-1');
      const policy = await stubs.mfaPolicyService.getForTenant!('tenant-1');
      const roles: Array<{ role: { name: string } }> = await stubs.userRoleRepo.find();
      const isAdminOrOwner = roles.some((ur) => ['owner', 'admin'].includes(ur.role.name.toLowerCase()));

      const needsEnrollment =
        !mfaStatus.enabled &&
        (policy.enforceForAllUsers || (policy.enforceForAdmins && isAdminOrOwner));

      expect(needsEnrollment).toBe(true);
    });

    it('T-008c: MFA already enabled → no enrollment required regardless of policy', async () => {
      const stubs = makeMfaStubs();
      (stubs.mfaService.getMfaStatus as jest.Mock).mockResolvedValue({ enabled: true, methods: ['totp'] });
      (stubs.mfaPolicyService.getForTenant as jest.Mock).mockResolvedValue({
        enforceForAllUsers: true,
        enforceForAdmins: true,
      } as Partial<TenantMfaPolicy>);

      const mfaStatus = await stubs.mfaService.getMfaStatus!('user-1', 'tenant-1');
      const policy = await stubs.mfaPolicyService.getForTenant!('tenant-1');

      const needsEnrollment =
        !mfaStatus.enabled &&
        (policy.enforceForAllUsers || policy.enforceForAdmins);

      expect(needsEnrollment).toBe(false);
    });

    it('T-008d: enforceForAdmins=true + member role → no enforcement', async () => {
      const stubs = makeMfaStubs();
      (stubs.mfaService.getMfaStatus as jest.Mock).mockResolvedValue({ enabled: false, methods: [] });
      (stubs.mfaPolicyService.getForTenant as jest.Mock).mockResolvedValue({
        enforceForAllUsers: false,
        enforceForAdmins: true,
      } as Partial<TenantMfaPolicy>);
      stubs.userRoleRepo.find.mockResolvedValue([{ role: { name: 'member' } }]);

      const policy = await stubs.mfaPolicyService.getForTenant!('tenant-1');
      const roles: Array<{ role: { name: string } }> = await stubs.userRoleRepo.find();
      const isAdminOrOwner = roles.some((ur) => ['owner', 'admin'].includes(ur.role.name.toLowerCase()));

      const needsEnrollment = policy.enforceForAllUsers || (policy.enforceForAdmins && isAdminOrOwner);
      expect(needsEnrollment).toBe(false);
    });

    it('T-008e: policy off entirely → no enforcement', async () => {
      const stubs = makeMfaStubs();
      (stubs.mfaPolicyService.getForTenant as jest.Mock).mockResolvedValue({
        enforceForAllUsers: false,
        enforceForAdmins: false,
      } as Partial<TenantMfaPolicy>);

      const policy = await stubs.mfaPolicyService.getForTenant!('tenant-1');
      const needsEnrollment = policy.enforceForAllUsers || policy.enforceForAdmins;
      expect(needsEnrollment).toBe(false);
    });
  });
});
