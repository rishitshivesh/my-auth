import { ApiException } from "@/common/http";
import { EmailController } from "./email.controller";

function build(env: string | undefined) {
  const svc = {
    sendWelcomeEmail: jest.fn().mockResolvedValue(true),
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
    sendMagicLinkEmail: jest.fn().mockResolvedValue(true),
    sendOTPEmail: jest.fn().mockResolvedValue(false),
    sendAccountDeletedEmail: jest.fn().mockResolvedValue(true),
  };
  const config = { get: () => env };
  return { c: new EmailController(svc as never, config as never), svc };
}

describe("EmailController.testEmail", () => {
  it("is forbidden in production", async () => {
    const { c, svc } = build("production");
    await expect(c.testEmail("welcome", "a@x.test")).rejects.toMatchObject({ code: "ACCESS_FORBIDDEN" });
    expect(Object.values(svc).every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it.each([
    ["welcome", "sendWelcomeEmail"],
    ["verification", "sendVerificationEmail"],
    ["password-reset", "sendPasswordResetEmail"],
    ["password-changed", "sendPasswordChangedEmail"],
    ["magic-link", "sendMagicLinkEmail"],
    ["account-deleted", "sendAccountDeletedEmail"],
  ])("dispatches %s via %s in development", async (type, method) => {
    const { c, svc } = build("development");
    const res = await c.testEmail(type, "a@x.test");
    expect((svc as Record<string, jest.Mock>)[method]).toHaveBeenCalledWith(expect.objectContaining({ email: "a@x.test" }), ...(type === "welcome" || type === "verification" ? [expect.any(String)] : type === "password-reset" || type === "magic-link" ? [expect.any(String)] : []));
    expect(res).toMatchObject({ success: true, type, recipient: "a@x.test" });
  });

  it("reports failure message when send returns false (otp)", async () => {
    const { c } = build("development");
    expect(await c.testEmail("otp", "a@x.test")).toMatchObject({ success: false, message: "Email failed to send" });
  });

  it("rejects unknown type with BAD_REQUEST", async () => {
    const { c } = build("development");
    await expect(c.testEmail("nope", "a@x.test")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c.testEmail("nope", "a@x.test")).rejects.toBeInstanceOf(ApiException);
  });

  it.each([undefined, "test", "staging"])("fails closed when NODE_ENV is %s", async (env) => {
    const { c, svc } = build(env);
    await expect(c.testEmail("welcome", "victim@x.test")).rejects.toMatchObject({ code: "ACCESS_FORBIDDEN" });
    expect(svc.sendWelcomeEmail).not.toHaveBeenCalled();
  });
});
