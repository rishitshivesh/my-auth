import { EmailService } from "./email.service";

jest.mock("@/common/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const user = {
  id: "u1", tenantId: "t1", email: "jane.doe@x.test", firstName: "Jane",
} as never;

function build(frontend: string | undefined = "https://app.test") {
  const config = { get: jest.fn((k: string) => (k === "FRONTEND_URL" ? frontend : undefined)) };
  const security = { log: jest.fn() };
  const mail = { send: jest.fn().mockResolvedValue(true) };
  const tenantRepo = { findOne: jest.fn().mockResolvedValue({ name: "Acme" }) };
  const service = new EmailService(config as never, security as never, mail as never, tenantRepo as never);
  return { service, security, mail, tenantRepo, config };
}

describe("EmailService", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2026-02-03T04:05:06Z")));
  afterEach(() => jest.useRealTimers());

  it("verification email: URL-encodes token, includes tenant name and logs EMAIL_SENT", async () => {
    const { service, mail, security } = build();
    await expect(service.sendVerificationEmail(user, "a b&c=d/?")).resolves.toBe(true);
    expect(mail.send).toHaveBeenCalledWith("verify-email", "jane.doe@x.test", {
      name: "Jane",
      verifyUrl: "https://app.test/verify-email?token=a%20b%26c%3Dd%2F%3F",
      expiresInHours: 24,
      tenantName: "Acme",
    });
    expect(security.log).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "t1", userId: "u1", severity: "info",
      metadata: { emailType: "verification", recipient: "jane.doe@x.test", queued: true },
    }));
  });

  it("welcome reuses verification with emailType welcome", async () => {
    const { service, security } = build();
    await service.sendWelcomeEmail(user, "tok");
    expect(security.log.mock.calls[0]?.[0].metadata.emailType).toBe("welcome");
  });

  it("logs warning severity and returns false when queueing fails", async () => {
    const { service, mail, security } = build();
    mail.send.mockResolvedValue(false);
    await expect(service.sendPasswordResetEmail(user, "t")).resolves.toBe(false);
    expect(security.log.mock.calls[0]?.[0]).toMatchObject({ severity: "warning", metadata: { queued: false } });
  });

  it("displayName falls back to email local part", async () => {
    const { service, mail } = build();
    await service.sendMagicLinkEmail({ ...(user as object), firstName: "" } as never, "t");
    expect(mail.send.mock.calls[0]?.[2]).toMatchObject({ name: "jane.doe", expiresInMinutes: 10, magicLinkUrl: "https://app.test/u/magic-link?token=t" });
  });

  it("tenant branding lookup failure degrades to undefined and still sends", async () => {
    const { service, mail, tenantRepo } = build();
    tenantRepo.findOne.mockRejectedValue(new Error("db"));
    await expect(service.sendPasswordResetEmail(user, "t")).resolves.toBe(true);
    expect(mail.send.mock.calls[0]?.[2].tenantName).toBeUndefined();
  });

  it("tenant with empty name or missing tenant yields undefined tenantName", async () => {
    const { service, mail, tenantRepo } = build();
    tenantRepo.findOne.mockResolvedValueOnce({ name: "" }).mockResolvedValueOnce(null);
    await service.sendOTPEmail(user, "1");
    await service.sendOTPEmail(user, "1");
    expect(mail.send.mock.calls[0]?.[2].tenantName).toBeUndefined();
    expect(mail.send.mock.calls[1]?.[2].tenantName).toBeUndefined();
  });

  it("OTP variants use correct expiry and type", async () => {
    const { service, mail, security } = build();
    await service.sendOTPEmail(user, "111111");
    await service.sendPasswordResetOtpEmail(user, "222222");
    expect(mail.send.mock.calls[0]?.[2]).toMatchObject({ code: "111111", expiresInMinutes: 10 });
    expect(mail.send.mock.calls[1]?.[2]).toMatchObject({ code: "222222", expiresInMinutes: 15 });
    expect(security.log.mock.calls.map((c) => c[0].metadata.emailType)).toEqual(["otp", "password_reset_otp"]);
  });

  it("password-changed formats 'when' in UTC and passes ip/requestId", async () => {
    const { service, mail } = build();
    await service.sendPasswordChangedEmail(user, { ipAddress: "1.2.3.4", requestId: "r1" });
    expect(mail.send.mock.calls[0]?.[2]).toMatchObject({ when: "2026-02-03 04:05 UTC", ip: "1.2.3.4", requestId: "r1", name: "Jane" });
    await service.sendPasswordChangedEmail(user, { when: new Date("2025-12-31T23:59:59Z") });
    expect(mail.send.mock.calls[1]?.[2]).toMatchObject({ when: "2025-12-31 23:59 UTC", ip: null });
  });

  it("invite email defaults role and has no userId in event", async () => {
    const { service, mail, security } = build();
    await service.sendInviteEmail({ to: "n@x.test", inviterName: "I", tenantName: "T", tenantId: "t9", inviteUrl: "https://u", expiresInDays: 7 });
    expect(mail.send).toHaveBeenCalledWith("invitation", "n@x.test", expect.objectContaining({ role: "member", acceptUrl: "https://u" }));
    expect(security.log.mock.calls[0]?.[0].userId).toBeUndefined();
    await service.sendInviteEmail({ to: "n@x.test", inviterName: "I", tenantName: "T", tenantId: "t9", inviteUrl: "u", expiresInDays: 7, role: "admin" });
    expect(mail.send.mock.calls[1]?.[2].role).toBe("admin");
  });

  it("account deleted: default purge in 30 days, explicit date honoured", async () => {
    const { service, mail } = build();
    await service.sendAccountDeletedEmail(user);
    await service.sendAccountDeletedEmail(user, new Date("2030-01-02T23:00:00Z"));
    expect(mail.send.mock.calls[0]?.[2].purgeOn).toBe("2026-03-05");
    expect(mail.send.mock.calls[1]?.[2].purgeOn).toBe("2030-01-02");
  });

  it("account locked includes unlockMinutes", async () => {
    const { service, mail } = build();
    await service.sendAccountLockedEmail(user, 15);
    expect(mail.send).toHaveBeenCalledWith("account-locked", "jane.doe@x.test", expect.objectContaining({ unlockMinutes: 15 }));
  });

  it("account link request builds confirm URL", async () => {
    const { service, mail } = build();
    await service.sendAccountLinkRequest({ user, provider: "google", token: "t/1" });
    expect(mail.send.mock.calls[0]?.[2]).toMatchObject({ provider: "google", confirmUrl: "https://app.test/u/link/confirm?token=t%2F1", expiresInMinutes: 60 });
  });

  it.each([
    ["session-reuse-alert", "session_reuse_alert"],
    ["mfa-enabled", "mfa_enabled"],
    ["mfa-disabled", "mfa_disabled"],
    ["passkey-added", "passkey_added"],
    ["passkey-removed", "passkey_removed"],
  ] as const)("security alert %s logs type %s", async (template, type) => {
    const { service, mail, security } = build();
    await service.sendSecurityAlertEmail(template, user);
    expect(mail.send.mock.calls[0]?.[0]).toBe(template);
    expect(security.log.mock.calls[0]?.[0].metadata.emailType).toBe(type);
  });

  it.each([undefined, "", "   ", "not-a-url", "ftp://x.test"])(
    "refuses to build links when FRONTEND_URL is %j",
    async (bad) => {
      const { service, mail, config } = build();
      config.get.mockReturnValue(bad);
      await expect(service.sendPasswordResetEmail(user, "t")).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
      expect(mail.send).not.toHaveBeenCalled();
    },
  );

  it("tolerates a trailing slash in FRONTEND_URL", async () => {
    const { service, mail, config } = build();
    config.get.mockReturnValue("https://app.test/");
    await service.sendPasswordResetEmail(user, "t");
    expect((mail.send.mock.calls[0]?.[2] as { resetUrl: string }).resetUrl).toMatch(/^https:\/\/app\.test\/reset-password\?token=/);
  });
});
