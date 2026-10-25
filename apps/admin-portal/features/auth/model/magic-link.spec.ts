import { describe, expect, it } from "@jest/globals";
import { resolveServerDestination } from "./destination";
import { classifyOutcome } from "./outcome";
import { afterWrongCode, attemptsLeft, failedLanding } from "./magic-landing";
import { describeRequester, groupMatchCode, nextPollDelay, pollFailurePhase, secondsLeft } from "./magic-poll";
import { createEnrollment, parseEnrollment } from "./enrollment";
import { MAGIC_LINK_MATCH_MAX_ATTEMPTS, MAGIC_LINK_POLL_MAX_MS, MAGIC_LINK_POLL_START_MS } from "@/constants/limits";

const ctx = { origin: "https://acme.sentry.test", rootDomain: "sentry.test", apiOrigin: "https://api.sentry.test" };
const preview = { requestedFrom: { userAgent: "Chrome on macOS", ip: "1.2.3.4" }, requiresMatchCode: true };

describe("magic link polling", () => {
  it("backs off geometrically and caps", () => {
    expect(nextPollDelay(0)).toBe(MAGIC_LINK_POLL_START_MS);
    expect(nextPollDelay(1)).toBeGreaterThan(nextPollDelay(0));
    expect(nextPollDelay(50)).toBe(MAGIC_LINK_POLL_MAX_MS);
    expect(nextPollDelay(-3)).toBe(MAGIC_LINK_POLL_START_MS);
  });

  it("counts down to zero and never goes negative", () => {
    expect(secondsLeft(0, 600, 0)).toBe(600);
    expect(secondsLeft(0, 600, 599_100)).toBe(1);
    expect(secondsLeft(0, 600, 700_000)).toBe(0);
  });

  it("stops on a used or expired link and on unknown errors", () => {
    expect(pollFailurePhase("LINK_ALREADY_USED")).toEqual({ phase: "used" });
    expect(pollFailurePhase("LINK_EXPIRED")).toEqual({ phase: "expired" });
    expect(pollFailurePhase("RATE_LIMITED")).toEqual({ phase: "failed" });
    expect(pollFailurePhase(undefined)).toEqual({ phase: "failed" });
  });

  it("groups the code for reading and describes the requester", () => {
    expect(groupMatchCode("123456")).toBe("123 456");
    expect(groupMatchCode("12")).toBe("12");
    expect(describeRequester(preview.requestedFrom)).toEqual({ device: "Chrome on macOS", ip: "1.2.3.4" });
    expect(describeRequester(null)).toBeNull();
    expect(describeRequester({ userAgent: " ", ip: "" })).toBeNull();
  });
});

describe("magic link landing", () => {
  it("maps link error codes to distinct failure states", () => {
    expect(failedLanding("LINK_EXPIRED")).toEqual({ phase: "failed", status: "expired" });
    expect(failedLanding("LINK_ALREADY_USED")).toEqual({ phase: "failed", status: "used" });
    expect(failedLanding("LINK_WRONG_ACCOUNT")).toEqual({ phase: "failed", status: "wrong-account" });
    expect(failedLanding("AUTH_TOKEN_INVALID")).toEqual({ phase: "failed", status: "invalid" });
  });

  it("returns to code entry after a wrong code and locks after the budget", () => {
    const working = (attempts: number) => ({ phase: "working", preview, attempts, entering: true }) as const;
    expect(afterWrongCode(working(0))).toMatchObject({ phase: "ready", attempts: 1, codeError: true, entering: true });
    expect(afterWrongCode(working(MAGIC_LINK_MATCH_MAX_ATTEMPTS - 1))).toEqual({ phase: "locked" });
    expect(attemptsLeft(2)).toBe(MAGIC_LINK_MATCH_MAX_ATTEMPTS - 2);
    expect(attemptsLeft(99)).toBe(0);
  });
});

describe("server destinations", () => {
  it("accepts the validated absolute destination the server echoes, rejects everything unsafe", () => {
    expect(resolveServerDestination("https://app.customer.test/cb?x=1", ctx)).toEqual({
      href: "https://app.customer.test/cb?x=1",
      isExternal: true,
    });
    expect(resolveServerDestination("/t/acme/users", ctx)).toEqual({ href: "/t/acme/users", isExternal: false });
    expect(resolveServerDestination("javascript:alert(1)", ctx)).toBeNull();
    expect(resolveServerDestination("data:text/html,x", ctx)).toBeNull();
    expect(resolveServerDestination("https://x.test/\u0000", ctx)).toBeNull();
    expect(resolveServerDestination(`https://x.test/${"a".repeat(3000)}`, ctx)).toBeNull();
    expect(resolveServerDestination(undefined, ctx)).toBeNull();
  });

  it("prefers the server redirect over the untrusted next param and carries it across MFA", () => {
    const session = classifyOutcome({ expiresIn: 1, tenantSlug: "acme", redirectUri: "https://app.customer.test/cb" }, "/t/acme/users", "x", ctx);
    expect(session).toMatchObject({ kind: "session", destination: { href: "https://app.customer.test/cb", isExternal: true } });
    const mfa = classifyOutcome({ mfaRequired: true, mfaChallenge: { tempToken: "t", methods: ["totp"] }, redirectUri: "https://app.customer.test/cb" }, null, "x", ctx);
    expect(mfa).toMatchObject({ kind: "mfa", redirectUri: "https://app.customer.test/cb" });
    const after = classifyOutcome({ expiresIn: 1, tenantSlug: "acme" }, null, "x", ctx, "https://app.customer.test/cb");
    expect(after).toMatchObject({ kind: "session", destination: { href: "https://app.customer.test/cb" } });
    expect(classifyOutcome({ status: "mfa_enrollment_required", redirectUri: "https://a.test/x" }, null, "x", ctx)).toMatchObject({ kind: "enroll", redirectUri: "https://a.test/x" });
  });
});

describe("enrollment handoff", () => {
  it("round-trips, expires and rejects junk", () => {
    const stored = createEnrollment({ enrollmentToken: "tok", next: "/x" }, 1000);
    expect(parseEnrollment(JSON.stringify(stored), 1001)).toMatchObject({ enrollmentToken: "tok", next: "/x" });
    expect(parseEnrollment(JSON.stringify(stored), stored.expiresAt)).toBeNull();
    expect(parseEnrollment("nope", 0)).toBeNull();
    expect(parseEnrollment(null, 0)).toBeNull();
    expect(parseEnrollment(JSON.stringify({ expiresAt: "soon" }), 0)).toBeNull();
  });

  it("works without a token (cookie-only sign-in methods)", () => {
    const stored = createEnrollment({}, 0);
    expect(parseEnrollment(JSON.stringify(stored), 1)).toMatchObject({ enrollmentToken: undefined });
  });
});
