import { ApiException } from '@/common/http';
import { MfaController } from './mfa.controller';

function setup() {
  const mfa = {
    setupTotp: jest.fn().mockResolvedValue({ secret: 's' }),
    verifyAndEnableTotp: jest.fn().mockResolvedValue({ backupCodes: ['a', 'b'] }),
    disableTotp: jest.fn(),
    regenerateBackupCodes: jest.fn().mockResolvedValue(['x', 'y', 'z']),
    verifyBackupCode: jest.fn(),
    getMfaStatus: jest.fn().mockResolvedValue({ enabled: true }),
    disableAllMfa: jest.fn(),
  };
  const otp = { sendOtp: jest.fn(), verifyOtp: jest.fn() };
  const wa = {
    startRegistration: jest.fn().mockResolvedValue({ challenge: 'c' }),
    finishRegistration: jest.fn().mockResolvedValue({ credentialId: 'cid' }),
    listCredentials: jest.fn().mockResolvedValue([{ id: 'cid' }]),
    deleteCredential: jest.fn(),
  };
  const ctl = new MfaController(mfa as never, otp as never, wa as never);
  return { ctl, mfa, otp, wa };
}

const req = () => ({ tenantId: 't1', user: { sub: 'u1' }, ip: '1.2.3.4', requestId: 'r1', get: () => 'UA' });
const ctx = { requestId: 'r1', ipAddress: '1.2.3.4', userAgent: 'UA' };

describe('MfaController', () => {
  it('setupTotp is scoped to the caller and tenant', async () => {
    const { ctl, mfa } = setup();
    await expect(ctl.setupTotp(req())).resolves.toEqual({ secret: 's' });
    expect(mfa.setupTotp).toHaveBeenCalledWith('u1', 't1');
  });

  it('verifyAndEnableTotp passes token and request context', async () => {
    const { ctl, mfa } = setup();
    await expect(ctl.verifyAndEnableTotp(req(), { token: '123456' } as never)).resolves.toEqual({
      message: 'TOTP MFA enabled successfully',
      backupCodes: ['a', 'b'],
    });
    expect(mfa.verifyAndEnableTotp).toHaveBeenCalledWith('u1', 't1', '123456', ctx);
  });

  it('verifyAndEnableTotp surfaces service errors', async () => {
    const { ctl, mfa } = setup();
    mfa.verifyAndEnableTotp.mockRejectedValue(new ApiException('AUTH_MFA_INVALID'));
    await expect(ctl.verifyAndEnableTotp(req(), { token: '0' } as never)).rejects.toMatchObject({ code: 'AUTH_MFA_INVALID' });
  });

  it('disableTotp / disableAllMfa forward context', async () => {
    const { ctl, mfa } = setup();
    await expect(ctl.disableTotp(req())).resolves.toEqual({ message: 'TOTP MFA disabled successfully' });
    expect(mfa.disableTotp).toHaveBeenCalledWith('u1', 't1', ctx);
    await expect(ctl.disableAllMfa(req())).resolves.toEqual({ message: 'All MFA methods disabled successfully' });
    expect(mfa.disableAllMfa).toHaveBeenCalledWith('u1', 't1', ctx);
  });

  it('regenerateBackupCodes returns codes and count', async () => {
    const { ctl } = setup();
    await expect(ctl.regenerateBackupCodes(req())).resolves.toEqual({ backupCodes: ['x', 'y', 'z'], count: 3 });
  });

  it('verifyBackupCode reports validity both ways', async () => {
    const { ctl, mfa } = setup();
    mfa.verifyBackupCode.mockResolvedValueOnce(true);
    await expect(ctl.verifyBackupCode(req(), { code: 'C' } as never)).resolves.toEqual({ valid: true, message: 'Backup code verified and consumed' });
    mfa.verifyBackupCode.mockResolvedValueOnce(false);
    await expect(ctl.verifyBackupCode(req(), { code: 'C' } as never)).resolves.toEqual({ valid: false, message: 'Invalid backup code' });
    expect(mfa.verifyBackupCode).toHaveBeenCalledWith('u1', 't1', 'C');
  });

  it('getMfaStatus delegates', async () => {
    const { ctl } = setup();
    await expect(ctl.getMfaStatus(req())).resolves.toEqual({ enabled: true });
  });

  describe('email OTP', () => {
    it('request sends to the caller', async () => {
      const { ctl, otp } = setup();
      await expect(ctl.requestEmailOtp(req())).resolves.toEqual({ message: 'OTP code sent to your email', expiresIn: '10 minutes' });
      expect(otp.sendOtp).toHaveBeenCalledWith('u1', 't1');
    });
    it('verify succeeds or throws AUTH_OTP_INVALID', async () => {
      const { ctl, otp } = setup();
      otp.verifyOtp.mockResolvedValueOnce(true);
      await expect(ctl.verifyEmailOtp(req(), { code: '123456' } as never)).resolves.toEqual({ message: 'Email OTP verified' });
      otp.verifyOtp.mockResolvedValueOnce(false);
      await expect(ctl.verifyEmailOtp(req(), { code: '000000' } as never)).rejects.toMatchObject({ code: 'AUTH_OTP_INVALID' });
    });
  });

  describe('webauthn', () => {
    it('start / list', async () => {
      const { ctl, wa } = setup();
      await expect(ctl.startWebAuthnRegistration(req())).resolves.toEqual({ challenge: 'c' });
      await expect(ctl.listWebAuthnCredentials(req())).resolves.toEqual({ credentials: [{ id: 'cid' }] });
      expect(wa.listCredentials).toHaveBeenCalledWith('u1', 't1');
    });
    it('finish passes response and device name', async () => {
      const { ctl, wa } = setup();
      await expect(ctl.finishWebAuthnRegistration(req(), { response: { id: 'x' }, deviceName: 'Phone' } as never)).resolves.toEqual({
        success: true,
        credentialId: 'cid',
        message: 'Passkey registered successfully',
      });
      expect(wa.finishRegistration).toHaveBeenCalledWith('u1', 't1', { id: 'x' }, 'Phone');
    });
    it('delete uses caller identity (cannot target another user) and context', async () => {
      const { ctl, wa } = setup();
      await expect(ctl.deleteWebAuthnCredential(req(), 'cid')).resolves.toEqual({ success: true, message: 'Passkey deleted successfully' });
      expect(wa.deleteCredential).toHaveBeenCalledWith('u1', 't1', 'cid', ctx);
    });
  });
});
