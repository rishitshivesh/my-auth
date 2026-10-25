import { describe, expect, it } from "@jest/globals";
import { buildReauthInput, stepUpErrorKind, stepUpIssue, stepUpModes } from "./step-up";

const req = (over: Partial<{ mfaEnabled: boolean; canUseTotp: boolean; canUsePasskey: boolean }>) => ({
  mfaEnabled: false,
  methods: [],
  canUseTotp: false,
  canUsePasskey: false,
  ...over,
});

describe("step-up modes", () => {
  it("password only without two-step verification", () => {
    expect(stepUpModes(req({}))).toEqual({ initial: "password", alternatives: [] });
  });

  it("password plus code first, passkey as alternative, when both are enrolled", () => {
    expect(stepUpModes(req({ mfaEnabled: true, canUseTotp: true, canUsePasskey: true }))).toEqual({
      initial: "password-totp",
      alternatives: ["passkey"],
    });
    expect(stepUpModes(req({ mfaEnabled: true, canUsePasskey: true })).initial).toBe("passkey");
  });

  it("flags MFA users whose factors cannot confirm a step-up", () => {
    expect(stepUpModes(req({ mfaEnabled: true })).initial).toBe("unsupported");
  });
});

describe("step-up input", () => {
  it("validates per mode", () => {
    expect(stepUpIssue("password", "", "")).toBe("password-empty");
    expect(stepUpIssue("password", "pw", "")).toBeNull();
    expect(stepUpIssue("password-totp", "pw", "12345")).toBe("code-incomplete");
    expect(stepUpIssue("password-totp", "pw", "123456")).toBeNull();
    expect(stepUpIssue("passkey", "", "")).toBeNull();
  });

  it("builds the accepted request bodies", () => {
    expect(buildReauthInput("password", "pw", "")).toEqual({ method: "password", password: "pw" });
    expect(buildReauthInput("password-totp", "pw", "123456")).toEqual({ method: "password", password: "pw", code: "123456" });
  });

  it("classifies errors", () => {
    expect(stepUpErrorKind({ code: "AUTH_INVALID_CREDENTIALS" })).toBe("wrong-password");
    expect(stepUpErrorKind({ code: "AUTH_MFA_INVALID" })).toBe("wrong-code");
    expect(stepUpErrorKind({ code: "AUTH_MFA_REQUIRED" })).toBe("mfa-required");
    expect(stepUpErrorKind({ code: "RATE_LIMITED" })).toBe("rate-limited");
    expect(stepUpErrorKind(new Error("x"))).toBe("generic");
  });
});
