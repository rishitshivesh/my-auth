/** Who/where an MFA change came from, for the audit trail and alert emails. */
export interface MfaRequestContext {
  requestId?: string;
  ipAddress: string;
  userAgent: string;
}

export const SYSTEM_MFA_CONTEXT: MfaRequestContext = {
  ipAddress: "0.0.0.0",
  userAgent: "system",
};

/** The few request members the context needs; satisfied by an Express request. */
export interface MfaContextSource {
  requestId?: string;
  ip?: string;
  get?(name: string): string | undefined;
}

export function mfaContextFromRequest(req: MfaContextSource): MfaRequestContext {
  return {
    requestId: req.requestId,
    ipAddress: req.ip ?? SYSTEM_MFA_CONTEXT.ipAddress,
    userAgent: req.get?.("user-agent") ?? SYSTEM_MFA_CONTEXT.userAgent,
  };
}
