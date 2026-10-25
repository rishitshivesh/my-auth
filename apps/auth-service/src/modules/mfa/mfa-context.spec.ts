import { mfaContextFromRequest, SYSTEM_MFA_CONTEXT } from './mfa-context';

describe('mfaContextFromRequest', () => {
  it('reads id, ip and user-agent from the request', () => {
    const get = jest.fn(() => 'UA');
    expect(mfaContextFromRequest({ requestId: 'r', ip: '1.2.3.4', get })).toEqual({ requestId: 'r', ipAddress: '1.2.3.4', userAgent: 'UA' });
    expect(get).toHaveBeenCalledWith('user-agent');
  });
  it('falls back to system defaults', () => {
    expect(mfaContextFromRequest({})).toEqual({ requestId: undefined, ipAddress: SYSTEM_MFA_CONTEXT.ipAddress, userAgent: 'system' });
    expect(mfaContextFromRequest({ get: () => undefined }).userAgent).toBe('system');
  });
});
