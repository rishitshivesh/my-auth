import { Amr, AMR_MAGIC_LINK, AMR_PASSKEY, AMR_PASSWORD, AMR_PASSWORD_BACKUP_CODE, AMR_PASSWORD_TOTP, AMR_SAML, AMR_SOCIAL, parseAmr, serializeAmr } from "./auth-methods";

describe("auth methods (amr)", () => {
  it("maps each completed login type to its methods", () => {
    expect(AMR_PASSWORD).toEqual(["pwd"]);
    expect(AMR_PASSWORD_TOTP).toEqual(["pwd", "otp", "totp", "mfa"]);
    expect(AMR_PASSWORD_BACKUP_CODE).toEqual(["pwd", "backup_code", "mfa"]);
    expect(AMR_PASSKEY).toEqual(["hwk", "webauthn"]);
    expect(AMR_MAGIC_LINK).toEqual(["magic_link"]);
    expect(AMR_SOCIAL).toEqual(["social"]);
    expect(AMR_SAML).toEqual([Amr.SSO, Amr.SAML]);
  });

  it("round-trips the space-separated storage form and tolerates empty values", () => {
    expect(parseAmr(serializeAmr(AMR_PASSWORD_TOTP))).toEqual([...AMR_PASSWORD_TOTP]);
    expect(parseAmr(null)).toEqual([]);
    expect(parseAmr("")).toEqual([]);
  });
});
