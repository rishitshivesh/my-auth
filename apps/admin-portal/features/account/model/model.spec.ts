import { describe, expect, it } from "@jest/globals";
import type { ActiveSession, MfaStatus, Profile, SecurityEvent, SocialConnection } from "@scrolloop/sdk";
import { eventLabelKey, eventPlace, severityKey, severityTone, sortEvents } from "./activity";
import { classifyPasskeyError, isRecentAuthError } from "./errors";
import { formatRecoveryCodes, summarizeMfa } from "./mfa";
import { isPasswordDraftReady, validatePasswordChange } from "./password";
import { identityLabel, toDraft, toUpdate, validateProfile } from "./profile";
import { elapsedSince, formatDate, formatRelative, sortSessions, toSessionRow } from "./sessions";
import { isKnownProvider, parseLinkResult, providerRows } from "./social";

const profile: Profile = { id: "1", tenantId: "t", email: "a@b.co", emailVerified: true, firstName: "Alex", lastName: null };

describe("errors", () => {
  it("recognises the recent-auth code on any error shape", () => {
    expect(isRecentAuthError({ code: "ACCESS_RECENT_AUTH_REQUIRED" })).toBe(true);
    expect(isRecentAuthError({ code: "OTHER" })).toBe(false);
    expect(isRecentAuthError(undefined)).toBe(false);
    expect(isRecentAuthError(new Error("x"))).toBe(false);
  });
  it("classifies passkey ceremony failures", () => {
    expect(classifyPasskeyError({ code: "PASSKEY_REGISTRATION_CANCELLED" })).toBe("cancelled");
    expect(classifyPasskeyError({ code: "PASSKEY_NOT_SUPPORTED" })).toBe("unsupported");
    expect(classifyPasskeyError(new Error("boom"))).toBe("failed");
  });
});

describe("profile", () => {
  it("maps nulls to empty drafts and builds identity labels", () => {
    expect(toDraft(profile).lastName).toBe("");
    expect(identityLabel(profile)).toBe("Alex");
    expect(identityLabel({ ...profile, firstName: null })).toBe("a@b.co");
    expect(identityLabel({ ...profile, displayName: "Al" })).toBe("Al");
  });
  it("sends only changed, non-empty, trimmed fields", () => {
    const initial = toDraft(profile);
    expect(toUpdate(initial, { ...initial, firstName: " Sam ", lastName: "" })).toEqual({ firstName: "Sam" });
    expect(toUpdate(initial, initial)).toEqual({});
  });
  it("validates timezone, language and phone", () => {
    const base = toDraft(profile);
    expect(validateProfile(base)).toEqual({});
    expect(validateProfile({ ...base, timezone: "Not/AZone" }).timezone).toBe("timezone");
    expect(validateProfile({ ...base, timezone: "Asia/Kolkata" }).timezone).toBeUndefined();
    expect(validateProfile({ ...base, language: "english!" }).language).toBe("language");
    expect(validateProfile({ ...base, language: "en-GB" }).language).toBeUndefined();
    expect(validateProfile({ ...base, phone: "abc" }).phone).toBe("phone");
    expect(validateProfile({ ...base, firstName: "x".repeat(101) }).firstName).toBe("tooLong");
  });
});

describe("password", () => {
  const ok = { current: "old-password", next: "a-new-long-passphrase", confirm: "a-new-long-passphrase" };
  it("accepts a valid change", () => expect(isPasswordDraftReady(ok)).toBe(true));
  it("reports each failure", () => {
    expect(validatePasswordChange({ ...ok, current: "" }).current).toBe("currentRequired");
    expect(validatePasswordChange({ ...ok, next: "short", confirm: "short" }).next).toBe("tooShort");
    expect(validatePasswordChange({ ...ok, next: ok.current, confirm: ok.current }).next).toBe("sameAsCurrent");
    expect(validatePasswordChange({ ...ok, confirm: "different" }).confirm).toBe("mismatch");
    expect(validatePasswordChange({ ...ok, next: "x".repeat(129), confirm: "x".repeat(129) }).next).toBe("tooLong");
  });
});

describe("mfa", () => {
  const status = (over: Partial<MfaStatus>): MfaStatus => ({ enabled: true, methods: ["totp"], backupCodesRemaining: 8, ...over });
  it("derives recovery state", () => {
    expect(summarizeMfa(status({}), 0).recoveryState).toBe("ok");
    expect(summarizeMfa(status({ backupCodesRemaining: 2 }), 0).recoveryState).toBe("low");
    expect(summarizeMfa(status({ backupCodesRemaining: 0 }), 0).recoveryState).toBe("none");
    expect(summarizeMfa(status({ enabled: false, methods: [] }), 0).recoveryState).toBe("unavailable");
  });
  it("flags totp as the last method only when nothing else remains", () => {
    expect(summarizeMfa(status({}), 0).totpIsLastMethod).toBe(true);
    expect(summarizeMfa(status({}), 1).totpIsLastMethod).toBe(false);
    expect(summarizeMfa(status({ methods: ["totp", "email"] }), 0).totpIsLastMethod).toBe(false);
  });
  it("joins codes for a single copy", () => expect(formatRecoveryCodes(["a", "b"])).toBe("a  b"));
});

describe("sessions", () => {
  const session = (id: string, isCurrent: boolean, lastActivity: string, over: Partial<ActiveSession> = {}): ActiveSession => ({
    id, isCurrent, lastActivity, createdAt: lastActivity, deviceInfo: { browser: "Chrome", os: "macOS" }, ...over,
  });
  it("puts this device first then newest", () => {
    const rows = [
      session("old", false, "2026-01-01T00:00:00Z"),
      session("new", false, "2026-02-01T00:00:00Z"),
      session("me", true, "2025-01-01T00:00:00Z"),
    ].map(toSessionRow);
    expect(sortSessions(rows).map((r) => r.id)).toEqual(["me", "new", "old"]);
  });
  it("falls back when location is unknown", () => {
    expect(toSessionRow(session("a", false, "2026-01-01T00:00:00Z")).location).toBeUndefined();
    expect(toSessionRow(session("a", false, "2026-01-01T00:00:00Z", { location: { city: "Pune", country: "India" } })).location).toBe("Pune, India");
  });
  it("describes elapsed time", () => {
    const now = Date.parse("2026-01-02T00:00:00Z");
    expect(elapsedSince("2026-01-02T00:00:00Z", now).kind).toBe("now");
    expect(elapsedSince("garbage", now).kind).toBe("unknown");
    expect(formatRelative(elapsedSince("2026-01-01T22:00:00Z", now), "Now", "?")).toBe("2 hours ago");
    expect(formatRelative({ kind: "now" }, "Now", "?")).toBe("Now");
    expect(formatDate(undefined, "-")).toBe("-");
  });
});

describe("activity", () => {
  const event = (over: Partial<SecurityEvent>): SecurityEvent => ({ id: "1", eventType: "LOGIN_SUCCESS", severity: "info", createdAt: "2026-01-01T00:00:00Z", ...over });
  it("maps known event types and falls back for unknown", () => {
    expect(eventLabelKey("LOGIN_SUCCESS")).toBe("account.activity.events.login");
    expect(eventLabelKey("SOMETHING_NEW")).toBe("account.activity.events.unknown");
  });
  it("maps severity to a key and a tone", () => {
    expect(severityKey("HIGH")).toBe("high");
    expect(severityKey("weird")).toBe("unknown");
    expect(severityTone("critical")).toBe("danger");
    expect(severityTone("medium")).toBe("warning");
    expect(severityTone("info")).toBe("neutral");
  });
  it("builds a place from location and ip, newest first", () => {
    expect(eventPlace({ location: { city: "Pune", country: "India" }, ipAddress: "1.2.3.4" })).toBe("Pune, India (1.2.3.4)");
    expect(eventPlace({ location: null, ipAddress: null })).toBeUndefined();
    expect(sortEvents([event({ id: "a" }), event({ id: "b", createdAt: "2026-02-01T00:00:00Z" })]).map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("social", () => {
  const conn = { id: "1", provider: "Google", email: "a@b.co", displayName: "A", primary: true, createdAt: "x" } as SocialConnection;
  it("lists every supported provider once, with its connection", () => {
    const rows = providerRows([conn]);
    expect(rows.map((r) => r.provider)).toEqual(["google", "github", "microsoft"]);
    expect(rows[0]?.connection).toBe(conn);
    expect(rows[1]?.connection).toBeUndefined();
  });
  it("accepts only known providers and link results", () => {
    expect(isKnownProvider("github")).toBe(true);
    expect(isKnownProvider("facebook")).toBe(false);
    expect(parseLinkResult("cancelled")).toBe("cancelled");
    expect(parseLinkResult("<script>")).toBeNull();
    expect(parseLinkResult(null)).toBeNull();
  });
});
