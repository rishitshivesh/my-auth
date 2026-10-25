import { describe, expect, it } from "@jest/globals";
import { resolveDestination } from "./destination";
import { classifyOutcome } from "./outcome";
import { tenantSlugFromHost, tenantOrigin } from "./tenant";
import { activeTenantSlug, tenantSlugFromPath } from "@/lib/tenant-host";
import { createChallenge, initialMethod, isChallengeLive, offeredMethods, parseChallenge } from "./challenge";
import { nextStepAfterEmail, resolveMethods } from "./login-flow";
import { parseLoginParams } from "./login-params";
import { checkPassword } from "./password-policy";
import { resetIssue } from "./reset-flow";
import { describeScopes, consentLoadIssue, safeExternalUrl } from "./consent";
import { failedPhase, isPlausibleToken, landingStatus, linkTarget } from "./link";
import { formatRecoveryCode, manualKeyGroups } from "./enroll";
import { describeFailure, waitParts } from "./failure";

const ctx = { origin: "https://acme.sentry.test", rootDomain: "sentry.test", apiOrigin: "https://api.sentry.test" };

describe("resolveDestination", () => {
  it("accepts same-origin paths", () => {
    expect(resolveDestination("/t/acme/users?x=1", ctx)).toEqual({ href: "/t/acme/users?x=1", isExternal: false });
  });
  it.each(["//evil.test", "/\\evil.test", "javascript:alert(1)", "https://evil.test/x", "", null, undefined, "/ok\nbad"])(
    "rejects %p",
    (raw) => expect(resolveDestination(raw, ctx)).toBeNull(),
  );
  it("accepts portal subdomains and the oauth authorize endpoint only on the api", () => {
    expect(resolveDestination("https://other.sentry.test/t/x", ctx)?.isExternal).toBe(true);
    expect(resolveDestination("https://api.sentry.test/oauth/authorize?client_id=a", ctx)?.isExternal).toBe(true);
    expect(resolveDestination("https://api.sentry.test/saml/sso/continue/abc12345", ctx)).not.toBeNull();
    expect(resolveDestination("https://api.sentry.test/users/me", ctx)).toBeNull();
  });
  it("normalises same-origin absolute urls to a path", () => {
    expect(resolveDestination("https://acme.sentry.test/a?b=1", ctx)).toEqual({ href: "/a?b=1", isExternal: false });
  });
});

describe("tenant", () => {
  it("reads the slug from the host", () => {
    expect(tenantSlugFromHost("acme.sentry.test:3000", "sentry.test")).toBe("acme");
    expect(tenantSlugFromHost("sentry.test", "sentry.test")).toBeNull();
    expect(tenantSlugFromHost("app.sentry.test", "sentry.test")).toBeNull();
    expect(tenantSlugFromHost("a.b.sentry.test", "sentry.test")).toBeNull();
  });
  it("builds another tenant origin only on the portal domain", () => {
    expect(tenantOrigin("beta", { protocol: "https:", host: "acme.sentry.test" }, "sentry.test")).toBe("https://beta.sentry.test");
    expect(tenantOrigin("beta", { protocol: "http:", host: "localhost:3000" }, "sentry.test")).toBeNull();
  });
});

describe("active tenant", () => {
  it("prefers the subdomain, then the console path, then the platform workspace", () => {
    expect(activeTenantSlug({ host: "acme.sentry.test:3000", pathname: "/t/other/users" }, "sentry.test", "sentry")).toBe("acme");
    expect(activeTenantSlug({ host: "sentry.test", pathname: "/t/other/users" }, "sentry.test", "sentry")).toBe("other");
    expect(activeTenantSlug({ host: "sentry.test", pathname: "/dashboard/profile" }, "sentry.test", "sentry")).toBe("sentry");
    expect(tenantSlugFromPath("/t/a%20b/x")).toBe("a b");
    expect(tenantSlugFromPath("/t/%E0%A4%A")).toBeNull();
    expect(tenantSlugFromPath("/u/login")).toBeNull();
  });
});

describe("classifyOutcome", () => {
  it("handles the session branch with validated next", () => {
    const out = classifyOutcome({ expiresIn: 1, tenantSlug: "acme" }, "/t/acme/users", "x", ctx);
    expect(out).toMatchObject({ kind: "session", tenantSlug: "acme", destination: { href: "/t/acme/users" } });
  });
  it("falls back to the tenant dashboard for unsafe next", () => {
    const out = classifyOutcome({ expiresIn: 1, tenantSlug: "acme" }, "https://evil.test", "x", ctx);
    expect(out).toMatchObject({ kind: "session", destination: { href: "/t/acme/dashboard" } });
  });
  it("handles the MFA challenge branch", () => {
    const out = classifyOutcome({ mfaRequired: true, mfaChallenge: { tempToken: "t", methods: ["totp"], remainingAttempts: 3 } }, null, "x", ctx);
    expect(out).toEqual({ kind: "mfa", tempToken: "t", methods: ["totp"], preferred: undefined, remainingAttempts: 3 });
  });
  it("handles the enrollment branch", () => {
    expect(classifyOutcome({ status: "mfa_enrollment_required" }, null, "x", ctx)).toEqual({ kind: "enroll", enrollmentToken: undefined, redirectUri: undefined });
  });
});

describe("challenge", () => {
  it("expires", () => {
    const c = createChallenge({ tempToken: "t", methods: [] }, 1000, 500);
    expect(isChallengeLive(c, 1499)).toBe(true);
    expect(isChallengeLive(c, 1500)).toBe(false);
    expect(isChallengeLive(null, 0)).toBe(false);
  });
  it("round-trips and rejects junk", () => {
    const c = createChallenge({ tempToken: "t", methods: ["totp"], next: "/x" }, 0);
    expect(parseChallenge(JSON.stringify(c))).toEqual({ ...c, preferred: undefined, remainingAttempts: undefined });
    expect(parseChallenge("not json")).toBeNull();
    expect(parseChallenge('{"tempToken":1}')).toBeNull();
  });
  it("offers only completable methods", () => {
    expect(offeredMethods(["webauthn", "email", "totp"])).toEqual(["totp", "email", "webauthn"]);
    expect(offeredMethods([])).toEqual(["totp"]);
    expect(offeredMethods(["sms"])).toEqual(["totp"]);
    expect(initialMethod(["totp", "email"], "email")).toBe("email");
    expect(initialMethod(["totp", "email"], "sms")).toBe("totp");
  });
});

describe("login flow", () => {
  const providers = { password: true, magicLink: true, passkey: false, social: [{ provider: "google", enabled: true }] } as never;
  it("uses tenant methods when the account is unknown (no enumeration)", () => {
    const methods = resolveMethods(providers, { exists: false, email: "a@b.c", methods: { password: false, magicLink: false, passkey: false, mfa: false, social: [] } });
    expect(methods).toMatchObject({ password: true, magicLink: true, social: ["google"] });
  });
  it("uses intent methods when known", () => {
    const methods = resolveMethods(providers, { exists: true, email: "a@b.c", methods: { password: true, magicLink: false, passkey: true, mfa: false, social: [] } });
    expect(methods).toMatchObject({ password: true, magicLink: false, passkey: true });
  });
  it("skips the chooser when only a password exists", () => {
    expect(nextStepAfterEmail({ password: true, magicLink: false, passkey: false, social: [] })).toBe("password");
    expect(nextStepAfterEmail({ password: true, magicLink: true, passkey: false, social: [] })).toBe("methods");
  });
  it("parses saml and oauth continuations", () => {
    const q = new URLSearchParams({ saml_continue: "abcdef123456", email: "a@b.c" });
    expect(parseLoginParams(q, "https://api.test/")).toMatchObject({ next: "https://api.test/saml/sso/continue/abcdef123456", isSamlContinuation: true, email: "a@b.c" });
    expect(parseLoginParams(new URLSearchParams({ continue: "https://api.test/oauth/authorize?a=1" }), "https://api.test").next).toContain("/oauth/authorize");
    expect(parseLoginParams(new URLSearchParams({ saml_continue: "../x" }), "https://api.test").isSamlContinuation).toBe(false);
  });
});

describe("password and reset", () => {
  it("applies the length floor and email check", () => {
    expect(checkPassword("short")).toBe("too-short");
    expect(checkPassword("a".repeat(129))).toBe("too-long");
    expect(checkPassword("jordan-smith-2024-x", "jordan@x.io")).toBe("contains-email");
    expect(checkPassword("correct horse battery")).toBeNull();
    expect(checkPassword("")).toBeNull();
  });
  it("orders reset issues", () => {
    const base = { code: "123456", password: "correct horse battery", confirm: "correct horse battery", email: "a@b.c" };
    expect(resetIssue({ ...base, code: "12" })).toBe("code-incomplete");
    expect(resetIssue({ ...base, password: "" })).toBe("password-empty");
    expect(resetIssue({ ...base, confirm: "x" })).toBe("mismatch");
    expect(resetIssue(base)).toBeNull();
  });
});

describe("links", () => {
  it("never treats a missing or malformed token as valid", () => {
    expect(isPlausibleToken(null)).toBe(false);
    expect(isPlausibleToken("a b")).toBe(false);
    expect(isPlausibleToken("abcdefgh12345")).toBe(true);
    expect(landingStatus({ phase: "valid" }, false)).toBe("invalid");
  });
  it("maps phases and failures", () => {
    expect(landingStatus({ phase: "redeeming" }, true)).toBe("pending");
    expect(landingStatus(failedPhase("AUTH_TOKEN_EXPIRED"), true)).toBe("expired");
    expect(landingStatus(failedPhase("AUTH_TOKEN_USED"), true)).toBe("used");
    expect(landingStatus(failedPhase("whatever"), true)).toBe("invalid");
  });
  it("only the valid primary action redeems", () => {
    expect(linkTarget("valid", "primary")).toBe("redeem");
    for (const s of ["expired", "used", "invalid", "wrong-account", "loading", "pending"] as const) {
      expect(linkTarget(s, "primary")).not.toBe("redeem");
      expect(linkTarget(s, "secondary")).not.toBe("redeem");
    }
  });
});

describe("consent and enroll helpers", () => {
  it("labels known scopes and passes unknown through", () => {
    const [a, b] = describeScopes(["email", "custom:x"]);
    expect(a?.copyKey).toBe("auth.consent.scopes.email");
    expect(b?.copyKey).toBeNull();
  });
  it("only allows http(s) client links", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("https://a.test/p")).toBe("https://a.test/p");
    expect(safeExternalUrl(undefined)).toBeNull();
  });
  it("classifies consent load failures", () => {
    expect(consentLoadIssue({ status: 401 })).toBe("sign-in-required");
    expect(consentLoadIssue({ status: 400 })).toBe("expired");
    expect(consentLoadIssue({ status: 500 })).toBe("error");
    expect(consentLoadIssue(new Error("x"))).toBe("error");
  });
  it("formats codes and keys", () => {
    expect(formatRecoveryCode("abcde12345")).toBe("abcde-12345");
    expect(manualKeyGroups("ABCDEFGHIJ")).toBe("ABCD EFGH IJ");
  });
  it("formats waits", () => {
    expect(waitParts(0.2)).toEqual({ unit: "seconds", value: 1 });
    expect(waitParts(61)).toEqual({ unit: "minutes", value: 2 });
  });
});

describe("describeFailure", () => {
  it("classifies api error codes and keeps the retry hint", () => {
    expect(describeFailure({ code: "AUTH_ACCOUNT_LOCKED", retryAfterSeconds: 90 })).toMatchObject({ kind: "locked", retryAfterSeconds: 90 });
    expect(describeFailure({ code: "AUTH_INVALID_CREDENTIALS", requestId: "r1" })).toMatchObject({ kind: "invalid-credentials", requestId: "r1" });
    expect(describeFailure({ code: "SOCIAL_PROVIDER_DISABLED" }).kind).toBe("provider-disabled");
    expect(describeFailure({ code: "PASSKEY_AUTH_CANCELLED" }).kind).toBe("passkey-cancelled");
  });
  it("falls back to generic and collects field errors", () => {
    expect(describeFailure(new Error("boom")).kind).toBe("generic");
    expect(describeFailure({ code: "VALIDATION_FAILED", fieldErrors: [{ field: "email", message: "bad" }] }).fieldErrors).toEqual({ email: "bad" });
  });
});
