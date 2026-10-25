import { MfaPolicyService } from './mfa-policy.service';

function setup() {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((e: Record<string, unknown>) => ({ ...e })),
    save: jest.fn(async (e: unknown) => e),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed') };
  const config = { get: jest.fn().mockReturnValue('secret-32-chars-xxxxxxxxxxxxxxxxx') };
  const svc = new MfaPolicyService(repo as never, jwt as never, config as never);
  return { svc, repo, jwt, config };
}

describe('MfaPolicyService', () => {
  describe('getForTenant', () => {
    it('returns an existing policy', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue({ tenantId: 't1', enforceForAllUsers: true });
      await expect(svc.getForTenant('t1')).resolves.toMatchObject({ enforceForAllUsers: true });
      expect(repo.save).not.toHaveBeenCalled();
    });
    it('creates and persists a default policy when none exists', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue(null);
      const out = await svc.getForTenant('t1');
      expect(repo.create).toHaveBeenCalledWith({ tenantId: 't1' });
      expect(repo.save).toHaveBeenCalledWith(out);
    });
    it.each([
      ['top-level code', { code: '42P01' }],
      ['driverError code', { driverError: { code: '42P01' } }],
    ])('returns permissive default only for undefined_table (%s)', async (_n, err) => {
      const { svc, repo } = setup();
      repo.findOne.mockRejectedValue(err);
      await expect(svc.getForTenant('t1')).resolves.toMatchObject({
        tenantId: 't1',
        enforceForAllUsers: false,
        enforceForAdmins: false,
        gracePeriodDays: 0,
        exemptRoleSlugs: [],
      });
    });
    it.each([
      ['connection error', new Error('ECONNREFUSED')],
      ['other pg code', { code: '57014' }],
      ['null', null],
    ])('FAILS CLOSED (rethrows) on %s so MFA is never silently bypassed', async (_n, err) => {
      const { svc, repo } = setup();
      repo.findOne.mockRejectedValue(err);
      await expect(svc.getForTenant('t1')).rejects.toBe(err);
    });
    it('rethrows when save fails', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue(null);
      repo.save.mockRejectedValue(new Error('disk'));
      await expect(svc.getForTenant('t1')).rejects.toThrow('disk');
    });
  });

  describe('updateForTenant', () => {
    it('creates when missing, merging data', async () => {
      const { svc, repo } = setup();
      repo.findOne.mockResolvedValue(null);
      await svc.updateForTenant('t1', { enforceForAdmins: true });
      expect(repo.create).toHaveBeenCalledWith({ tenantId: 't1', enforceForAdmins: true });
    });
    it('merges into the existing row', async () => {
      const { svc, repo } = setup();
      const row = { tenantId: 't1', gracePeriodDays: 1 };
      repo.findOne.mockResolvedValue(row);
      const out = await svc.updateForTenant('t1', { gracePeriodDays: 9 });
      expect(out).toBe(row);
      expect(row.gracePeriodDays).toBe(9);
    });
  });

  it('issueEnrollmentToken signs a short-lived, purpose-bound token with JWT_SECRET', async () => {
    const { svc, jwt, config } = setup();
    await expect(svc.issueEnrollmentToken('u1', 't1')).resolves.toBe('signed');
    expect(config.get).toHaveBeenCalledWith('JWT_SECRET');
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'u1', tid: 't1', purpose: 'mfa_enrollment' },
      { expiresIn: '15m', secret: 'secret-32-chars-xxxxxxxxxxxxxxxxx' },
    );
  });
});
