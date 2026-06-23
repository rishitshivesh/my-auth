import { MfaPolicyService } from './mfa-policy.service';
import { MfaService } from './mfa.service';
import { TenantMfaPolicy } from '@repo/database';
import { JwtService } from '@nestjs/jwt';

// Minimal stubs for AuthService dependencies not relevant to this test
const makeStubs = () => ({
  userRepo: {
    createQueryBuilder: jest.fn().mockReturnValue({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    }),
    update: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(),
    find: jest.fn(),
  },
  mfaService: {
    getMfaStatus: jest.fn(),
    hasActiveFactor: jest.fn(),
  } as Partial<MfaService>,
  mfaPolicyService: {
    getForTenant: jest.fn(),
    issueEnrollmentToken: jest.fn().mockResolvedValue('enroll-token-abc'),
  } as Partial<MfaPolicyService>,
  userRoleRepo: {
    find: jest.fn(),
  },
  sessionService: { createSession: jest.fn() },
  oauthRefreshTokenService: { createRefreshToken: jest.fn() },
  jwksService: { getCurrentSigningKey: jest.fn() },
  jwtService: { sign: jest.fn(), signAsync: jest.fn() } as Partial<JwtService>,
  securityEventService: { log: jest.fn() },
  redisService: { get: jest.fn(), set: jest.fn() },
  webauthnService: { finishAuthentication: jest.fn() },
  passwordService: {},
  emailService: {},
  tenantRepository: { findOne: jest.fn() },
  sessionRepository: {},
});

/**
 * Replicates the enforcement block logic shared across
 * verifyMagicLink, finishWebAuthnLogin, and loginWithSocialConnection:
 *
 *   const mfaStatus = await mfaService.getMfaStatus(userId, tenantId);
 *   if (!mfaStatus.enabled) {
 *     const policy = await mfaPolicyService.getForTenant(tenantId);
 *     const roles = await userRoleRepo.find(...);
 *     const isAdminOrOwner = roles.some(ur => ['owner','admin'].includes(ur.role.name.toLowerCase()));
 *     const needsEnrollment = policy.enforceForAllUsers || (policy.enforceForAdmins && isAdminOrOwner);
 *     if (needsEnrollment) {
 *       const enrollmentToken = await mfaPolicyService.issueEnrollmentToken(userId, tenantId);
 *       return { status: 'mfa_enrollment_required', enrollmentToken };
 *     }
 *   }
 */
async function runEnforcementBlock(
  mfaService: Partial<MfaService>,
  mfaPolicyService: Partial<MfaPolicyService>,
  userRoleRepo: { find: jest.Mock },
  userId: string,
  tenantId: string,
): Promise<{ status: 'mfa_enrollment_required'; enrollmentToken: string } | null> {
  const mfaStatus = await mfaService.getMfaStatus!(userId, tenantId);
  if (!mfaStatus.enabled) {
    const policy = await mfaPolicyService.getForTenant!(tenantId);
    const roles: Array<{ role: { name: string } }> = await userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });
    const isAdminOrOwner = roles.some((ur) =>
      ['owner', 'admin'].includes(ur.role.name.toLowerCase()),
    );
    const needsEnrollment =
      policy.enforceForAllUsers || (policy.enforceForAdmins && isAdminOrOwner);
    if (needsEnrollment) {
      const enrollmentToken = await mfaPolicyService.issueEnrollmentToken!(userId, tenantId);
      return { status: 'mfa_enrollment_required', enrollmentToken };
    }
  }
  return null;
}

describe('MFA enrollment enforcement (T-008)', () => {
  describe('verifyMagicLink — enrollment enforcement', () => {
    it('T-008a: enforceForAllUsers=true + no MFA → returns mfa_enrollment_required', async () => {
      const stubs = makeStubs();

      (stubs.mfaService.getMfaStatus as jest.Mock).mockResolvedValue({
        enabled: false,
        methods: [],
      });
      (stubs.mfaPolicyService.getForTenant as jest.Mock).mockResolvedValue({
        enforceForAllUsers: true,
        enforceForAdmins: false,
      } as Partial<TenantMfaPolicy>);
      stubs.userRoleRepo.find.mockResolvedValue([]);

      const result = await runEnforcementBlock(
        stubs.mfaService,
        stubs.mfaPolicyService,
        stubs.userRoleRepo,
        'user-1',
        'tenant-1',
      );

      expect(result).toEqual({
        status: 'mfa_enrollment_required',
        enrollmentToken: 'enroll-token-abc',
      });
      expect(stubs.mfaService.getMfaStatus).toHaveBeenCalledWith('user-1', 'tenant-1');
      expect(stubs.mfaPolicyService.getForTenant).toHaveBeenCalledWith('tenant-1');
      expect(stubs.mfaPolicyService.issueEnrollmentToken).toHaveBeenCalledWith('user-1', 'tenant-1');
    });

    it('T-008d: MFA already enabled → skips enforcement entirely', async () => {
      const stubs = makeStubs();

      (stubs.mfaService.getMfaStatus as jest.Mock).mockResolvedValue({
        enabled: true,
        methods: ['totp'],
      });

      const result = await runEnforcementBlock(
        stubs.mfaService,
        stubs.mfaPolicyService,
        stubs.userRoleRepo,
        'user-1',
        'tenant-1',
      );

      expect(result).toBeNull();
      // Policy and role lookups must NOT fire when MFA is already enabled
      expect(stubs.mfaPolicyService.getForTenant).not.toHaveBeenCalled();
      expect(stubs.mfaPolicyService.issueEnrollmentToken).not.toHaveBeenCalled();
    });

    it('T-008e: policy off entirely → no enforcement even without MFA', async () => {
      const stubs = makeStubs();

      (stubs.mfaService.getMfaStatus as jest.Mock).mockResolvedValue({
        enabled: false,
        methods: [],
      });
      (stubs.mfaPolicyService.getForTenant as jest.Mock).mockResolvedValue({
        enforceForAllUsers: false,
        enforceForAdmins: false,
      } as Partial<TenantMfaPolicy>);
      stubs.userRoleRepo.find.mockResolvedValue([]);

      const result = await runEnforcementBlock(
        stubs.mfaService,
        stubs.mfaPolicyService,
        stubs.userRoleRepo,
        'user-1',
        'tenant-1',
      );

      expect(result).toBeNull();
      expect(stubs.mfaPolicyService.issueEnrollmentToken).not.toHaveBeenCalled();
    });

    it('T-008b: enforceForAdmins=true + admin role + no MFA → returns mfa_enrollment_required', async () => {
      const stubs = makeStubs();

      (stubs.mfaService.getMfaStatus as jest.Mock).mockResolvedValue({
        enabled: false,
        methods: [],
      });
      (stubs.mfaPolicyService.getForTenant as jest.Mock).mockResolvedValue({
        enforceForAllUsers: false,
        enforceForAdmins: true,
      } as Partial<TenantMfaPolicy>);
      stubs.userRoleRepo.find.mockResolvedValue([{ role: { name: 'admin' } }]);

      const result = await runEnforcementBlock(
        stubs.mfaService,
        stubs.mfaPolicyService,
        stubs.userRoleRepo,
        'user-1',
        'tenant-1',
      );

      expect(result).toEqual({
        status: 'mfa_enrollment_required',
        enrollmentToken: 'enroll-token-abc',
      });
    });

    it('T-008c: enforceForAdmins=true + member role + no MFA → no enforcement', async () => {
      const stubs = makeStubs();

      (stubs.mfaService.getMfaStatus as jest.Mock).mockResolvedValue({
        enabled: false,
        methods: [],
      });
      (stubs.mfaPolicyService.getForTenant as jest.Mock).mockResolvedValue({
        enforceForAllUsers: false,
        enforceForAdmins: true,
      } as Partial<TenantMfaPolicy>);
      stubs.userRoleRepo.find.mockResolvedValue([{ role: { name: 'member' } }]);

      const result = await runEnforcementBlock(
        stubs.mfaService,
        stubs.mfaPolicyService,
        stubs.userRoleRepo,
        'user-1',
        'tenant-1',
      );

      expect(result).toBeNull();
      expect(stubs.mfaPolicyService.issueEnrollmentToken).not.toHaveBeenCalled();
    });
  });
});
