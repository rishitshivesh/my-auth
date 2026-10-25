import { EMPTY_LDAP_DRAFT, syncState, toLdapBody, validateLdapDraft, withTls } from "./ldap";
import { EMPTY_SAML_DRAFT, toSamlBody, validateSamlDraft } from "./saml";
import { isExpired, toScimBody } from "./scim";
import { socialRows, toSocialBody, validateSocialDraft } from "./social";

describe("social", () => {
  it("lists all providers and needs a secret only when none is stored", () => {
    const rows = socialRows([{ provider: "google", enabled: true, clientId: "id", hasClientSecret: true }]);
    expect(rows.map((r) => r.provider)).toEqual(["google", "github", "microsoft"]);
    expect(rows[0]?.configured).toBe(true);
    expect(validateSocialDraft({ enabled: true, clientId: "id", clientSecret: "" }, rows[0]!)).toEqual([]);
    expect(validateSocialDraft({ enabled: true, clientId: "id", clientSecret: "" }, rows[1]!)).toEqual(["clientSecret"]);
    expect(toSocialBody({ enabled: true, clientId: " id ", clientSecret: "" })).toEqual({ enabled: true, clientId: "id" });
  });
});

describe("saml", () => {
  it("validates and trims", () => {
    expect(validateSamlDraft(EMPTY_SAML_DRAFT)).toEqual(["name", "entityId", "acsUrl"]);
    const body = toSamlBody({ ...EMPTY_SAML_DRAFT, name: "A", entityId: "e", acsUrl: " https://x.test/acs " });
    expect(body).toEqual({ name: "A", entityId: "e", acsUrl: "https://x.test/acs" });
  });
});

describe("scim", () => {
  it("maps expiry to days and detects expired tokens", () => {
    expect(toScimBody({ name: "x", expiry: "never" })).toEqual({ name: "x" });
    expect(toScimBody({ name: "x", expiry: "30" })).toEqual({ name: "x", expiresInDays: 30 });
    expect(isExpired({ expiresAt: "2020-01-01T00:00:00Z" }, new Date("2021-01-01"))).toBe(true);
    expect(isExpired({ expiresAt: null }, new Date())).toBe(false);
  });
});

describe("ldap", () => {
  it("moves the port with TLS only from a default", () => {
    expect(withTls(EMPTY_LDAP_DRAFT, true).port).toBe("636");
    expect(withTls({ ...EMPTY_LDAP_DRAFT, port: "1389" }, true).port).toBe("1389");
  });
  it("validates and builds the body", () => {
    expect(validateLdapDraft({ ...EMPTY_LDAP_DRAFT, port: "70000", userFilter: "a\u0001" })).toEqual(
      expect.arrayContaining(["name", "host", "port", "bindDn", "bindPassword", "baseDn", "controlChars"]),
    );
    const body = toLdapBody({ ...EMPTY_LDAP_DRAFT, name: "d", host: "h", bindDn: "cn", bindPassword: "p", baseDn: "dc" });
    expect(body).toMatchObject({ port: 389, useTls: false });
    expect(body).not.toHaveProperty("userFilter");
  });
  it("derives sync state", () => {
    expect(syncState({ lastSyncAt: null })).toBe("never");
    expect(syncState({ lastSyncAt: "x", lastSyncStatus: "failed" })).toBe("failed");
    expect(syncState({ lastSyncAt: "x", lastSyncStatus: "completed" })).toBe("ok");
  });
});
