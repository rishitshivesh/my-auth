import { describe, expect, it } from "@jest/globals";
import { availableActions, personInitials, personName, personStatus, profileChanges, validateProfile } from "./person";
import { DEFAULT_FILTERS, isFiltered, toUsersQuery, withFilters } from "./list-query";
import { inviteExpiry, parseEmails, summarizeBatch } from "./invites";
import { formatRelative } from "./time";

const NOW = Date.parse("2026-10-25T12:00:00Z");

describe("person status", () => {
  const base = { isActive: true, emailVerified: true };
  it("derives status from flags", () => {
    expect(personStatus(base, NOW)).toBe("active");
    expect(personStatus({ ...base, emailVerified: false }, NOW)).toBe("pending");
    expect(personStatus({ ...base, isActive: false }, NOW)).toBe("inactive");
    expect(personStatus({ ...base, status: "suspended" }, NOW)).toBe("suspended");
  });
  it("treats a future lock as suspended and a past lock as not", () => {
    expect(personStatus({ ...base, lockedUntil: "2099-01-01T00:00:00Z" }, NOW)).toBe("suspended");
    expect(personStatus({ ...base, lockedUntil: "2020-01-01T00:00:00Z" }, NOW)).toBe("active");
  });
  it("names people with sensible fallbacks", () => {
    expect(personName({ email: "a@b.co", displayName: " Ada " })).toBe("Ada");
    expect(personName({ email: "a@b.co", firstName: "Ada", lastName: "L" })).toBe("Ada L");
    expect(personName({ email: "a@b.co" })).toBe("a@b.co");
    expect(personInitials("Ada Lovelace")).toBe("AL");
  });
});

describe("available actions", () => {
  it("offers suspend to active people and reactivate to suspended ones", () => {
    expect(availableActions("active", false)).toContain("suspend");
    expect(availableActions("suspended", false)).toContain("reactivate");
    expect(availableActions("suspended", false)).not.toContain("forceReset");
  });
  it("withholds destructive actions from yourself and from deleted users", () => {
    const own = availableActions("active", true);
    expect(own).not.toContain("suspend");
    expect(own).not.toContain("delete");
    expect(availableActions("active", false, true)).toEqual([]);
  });
});

describe("profile form", () => {
  it("validates length and phone", () => {
    expect(validateProfile({ firstName: "x".repeat(81), lastName: "", displayName: "", phone: "abc" })).toEqual({
      firstName: "tooLong", phone: "phoneFormat",
    });
  });
  it("sends only changed fields", () => {
    const orig = { firstName: "A", lastName: "B", displayName: "", phone: "" };
    expect(profileChanges(orig, { ...orig, lastName: " C " })).toEqual({ lastName: "C" });
    expect(profileChanges(orig, orig)).toEqual({});
  });
});

describe("people list query", () => {
  it("builds page, limit and supported filters", () => {
    expect(toUsersQuery({ ...DEFAULT_FILTERS, search: " ann ", status: "active", page: 2 })).toBe(
      "?page=2&limit=20&search=ann&isActive=true",
    );
    expect(toUsersQuery({ ...DEFAULT_FILTERS, status: "verified" })).toContain("emailVerified=true");
  });
  it("resets to page 1 on filter change and detects filtering", () => {
    const next = withFilters({ ...DEFAULT_FILTERS, page: 4 }, { search: "x" });
    expect(next.page).toBe(1);
    expect(isFiltered(next)).toBe(true);
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
  });
});

describe("invitation parsing", () => {
  it("normalises, de-duplicates and separates invalid entries", () => {
    const parsed = parseEmails("A@x.com, a@x.com; bad\nb@y.org");
    expect(parsed.valid).toEqual(["a@x.com", "b@y.org"]);
    expect(parsed.invalid).toEqual(["bad"]);
    expect(parsed.duplicates).toBe(1);
  });
  it("flags batches over the limit", () => {
    expect(parseEmails("a@x.com b@x.com", 1).overLimit).toBe(true);
    expect(parseEmails("", 1).valid).toEqual([]);
  });
  it("classifies expiry", () => {
    expect(inviteExpiry("2026-10-25T11:00:00Z", NOW).state).toBe("expired");
    expect(inviteExpiry("2026-10-26T06:00:00Z", NOW)).toEqual({ state: "expiringSoon", daysLeft: 1 });
    expect(inviteExpiry("2026-11-01T12:00:00Z", NOW)).toEqual({ state: "active", daysLeft: 7 });
  });
  it("summarises a partial batch", () => {
    const out = summarizeBatch([{ email: "a", ok: true }, { email: "b", ok: false, error: "RESOURCE_CONFLICT" }]);
    expect(out.sent).toBe(1);
    expect(out.failed[0]?.email).toBe("b");
  });
});

describe("relative time", () => {
  it("formats and tolerates missing values", () => {
    expect(formatRelative("2026-10-25T10:00:00Z", NOW)).toBe("2 hours ago");
    expect(formatRelative(undefined, NOW)).toBeNull();
    expect(formatRelative("nope", NOW)).toBeNull();
  });
});
