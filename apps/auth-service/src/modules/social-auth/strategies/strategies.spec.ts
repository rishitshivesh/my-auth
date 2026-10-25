import type { ConfigService } from "@nestjs/config";
import type { SocialProfile } from "../social-auth.service";
import { GoogleStrategy } from "./google.strategy";
import { GitHubStrategy } from "./github.strategy";
import { MicrosoftStrategy } from "./microsoft.strategy";

jest.mock("@nestjs/common", () => {
  const actual = jest.requireActual("@nestjs/common");
  return { ...actual, Logger: class { log() {} debug() {} error() {} warn() {} } };
});

const config = (missing?: string): ConfigService =>
  ({
    get: (k: string) => (k === missing ? undefined : `val-${k}`),
  }) as unknown as ConfigService;

type Done = jest.Mock<void, [Error | null, SocialProfile | undefined]>;
const done = (): Done => jest.fn();

describe("GoogleStrategy", () => {
  const profile = (o: Record<string, unknown> = {}) => ({
    id: "g1", displayName: "Ann Lee", name: { givenName: "Ann", familyName: "Lee" },
    emails: [{ value: "a@x.test", verified: true }], photos: [{ value: "http://p" }], _json: { sub: "g1" }, ...o,
  });

  it("still constructs when a provider is unconfigured (the app must boot without social credentials)", () => {
    expect(() => new GoogleStrategy(config("INTERNAL_GOOGLE_CLIENT_SECRET"))).not.toThrow();
  });

  it("maps a verified profile", async () => {
    const d = done();
    await new GoogleStrategy(config()).validate({}, "at", "rt", profile() as never, d as never);
    expect(d).toHaveBeenCalledWith(null, expect.objectContaining({
      provider: "google", providerId: "g1", email: "a@x.test", emailVerified: true, firstName: "Ann",
      lastName: "Lee", avatarUrl: "http://p", accessToken: "at", refreshToken: "rt", raw: { sub: "g1" },
    }));
  });

  it("defaults emailVerified to false when Google omits the flag", async () => {
    const d = done();
    await new GoogleStrategy(config()).validate({}, "at", undefined, profile({ emails: [{ value: "a@x.test" }] }) as never, d as never);
    expect(d.mock.calls[0]?.[1]?.emailVerified).toBe(false);
  });

  it("errors when no email is provided", async () => {
    const d = done();
    await new GoogleStrategy(config()).validate({}, "at", undefined, profile({ emails: undefined }) as never, d as never);
    expect(d.mock.calls[0]?.[0]?.message).toBe("Email not provided by Google");
    expect(d.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("forwards unexpected exceptions to done", async () => {
    const d = done();
    const bad = { get id(): string { throw new Error("boom"); }, emails: [{ value: "a@x" }] };
    await new GoogleStrategy(config()).validate({}, "at", undefined, bad as never, d as never);
    expect(d.mock.calls[0]?.[0]?.message).toBe("boom");
  });
});

describe("GitHubStrategy", () => {
  const profile = (o: Record<string, unknown> = {}) => ({
    id: "gh1", username: "annl", displayName: "", emails: [{ value: "x@x.test" }, { value: "p@x.test", primary: true, verified: true }],
    photos: [{ value: "http://av" }], _json: { id: 1 }, ...o,
  });

  it("still constructs when a provider is unconfigured", () => {
    expect(() => new GitHubStrategy(config("INTERNAL_GITHUB_CLIENT_ID"))).not.toThrow();
  });

  it("selects the primary email and falls back to username as display name", async () => {
    const d = done();
    await new GitHubStrategy(config()).validate({}, "at", undefined, profile() as never, d as never);
    expect(d).toHaveBeenCalledWith(null, expect.objectContaining({
      provider: "github", providerId: "gh1", email: "p@x.test", emailVerified: true, displayName: "annl", avatarUrl: "http://av",
    }));
  });

  it("uses first email when none is primary, and treats missing verified as false", async () => {
    const d = done();
    await new GitHubStrategy(config()).validate({}, "at", undefined, profile({ emails: [{ value: "first@x.test" }] }) as never, d as never);
    expect(d.mock.calls[0]?.[1]).toMatchObject({ email: "first@x.test", emailVerified: false });
  });

  it("errors without emails; avatar falls back to avatar_url", async () => {
    const d = done();
    const s = new GitHubStrategy(config());
    await s.validate({}, "at", undefined, profile({ emails: [] }) as never, d as never);
    expect(d.mock.calls[0]?.[0]?.message).toBe("Email not provided by GitHub");
    const d2 = done();
    await s.validate({}, "at", undefined, profile({ photos: [], avatar_url: "http://fallback" }) as never, d2 as never);
    expect(d2.mock.calls[0]?.[1]?.avatarUrl).toBe("http://fallback");
  });

  it("forwards unexpected exceptions", async () => {
    const d = done();
    const bad = { get id(): string { throw new Error("gh boom"); } };
    await new GitHubStrategy(config()).validate({}, "at", undefined, bad as never, d as never);
    expect(d.mock.calls[0]?.[0]?.message).toBe("gh boom");
  });
});

describe("MicrosoftStrategy", () => {
  const profile = (o: Record<string, unknown> = {}) => ({
    id: "m1", displayName: "Ann", name: { givenName: "A", familyName: "L" }, emails: [{ value: "a@corp.test" }], photos: [], _json: {}, ...o,
  });

  it("still constructs when a provider is unconfigured", () => {
    expect(() => new MicrosoftStrategy(config("INTERNAL_MICROSOFT_CALLBACK_URL"))).not.toThrow();
  });

  it("maps profile", async () => {
    const d = done();
    await new MicrosoftStrategy(config()).validate({}, "at", "rt", profile(), d);
    expect(d).toHaveBeenCalledWith(null, expect.objectContaining({ provider: "microsoft", providerId: "m1", email: "a@corp.test", firstName: "A" }));
  });

  it("errors without email", async () => {
    const d = done();
    await new MicrosoftStrategy(config()).validate({}, "at", undefined, profile({ emails: [] }), d);
    expect(d.mock.calls[0]?.[0]?.message).toBe("Email not provided by Microsoft");
  });

  it("forwards exceptions", async () => {
    const d = done();
    await new MicrosoftStrategy(config()).validate({}, "at", undefined, { get id(): string { throw new Error("ms boom"); } }, d);
    expect(d.mock.calls[0]?.[0]?.message).toBe("ms boom");
  });

  // Entra/MSA email claims are mutable and unverified by default (nOAuth).
  it("does not blindly trust the Microsoft email claim as verified", async () => {
    const d = done();
    await new MicrosoftStrategy(config()).validate({}, "at", undefined, profile(), d);
    expect(d.mock.calls[0]?.[1]?.emailVerified).toBe(false);
  });

  it.each([
    [{ xms_edov: true }, true],
    [{ xms_edov: "1" }, true],
    [{ verified_email: true }, true],
    [{ xms_edov: false }, false],
    [{ email_verified: true }, false],
    [null, false],
  ])("emailVerified from claims %j is %s", async (json, expected) => {
    const d = done();
    await new MicrosoftStrategy(config()).validate({}, "at", undefined, profile({ _json: json }), d);
    expect(d.mock.calls[0]?.[1]?.emailVerified).toBe(expected);
  });
});
