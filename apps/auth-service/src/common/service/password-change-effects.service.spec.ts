import { SecurityEventType, User } from "@repo/database";
import { EmailService } from "@/modules/email/email.service";
import { PasswordChangeEffectsService } from "./password-change-effects.service";
import { SecurityEventService } from "./security-event.service";
import { SessionService } from "./session.service";

const user = { id: "u1", tenantId: "t1", email: "a@b.com" } as User;

function build() {
  const sessions = { revokeOtherUserSessions: jest.fn(async () => ["s1", "s2"]) };
  const email = { sendPasswordChangedEmail: jest.fn(async () => true) };
  const events = { log: jest.fn() };
  const service = new PasswordChangeEffectsService(
    sessions as unknown as SessionService,
    email as unknown as EmailService,
    events as unknown as SecurityEventService,
  );
  return { service, sessions, email, events };
}

describe("PasswordChangeEffectsService", () => {
  it("revokes other sessions but keeps the current one", async () => {
    const { service, sessions } = build();
    await service.afterPasswordChange({
      user, ip: "1.1.1.1", userAgent: "ua", keepSessionId: "keep", reason: "password_change",
    });
    expect(sessions.revokeOtherUserSessions).toHaveBeenCalledWith("t1", "u1", "keep", "password_change");
  });

  it("signs out everywhere when no session is kept", async () => {
    const { service, sessions } = build();
    await service.afterPasswordChange({ user, ip: "1.1.1.1", userAgent: "ua", reason: "password_reset" });
    expect(sessions.revokeOtherUserSessions).toHaveBeenCalledWith("t1", "u1", undefined, "password_reset");
  });

  it("emails the user with ip and request id", async () => {
    const { service, email } = build();
    await service.afterPasswordChange({
      user, ip: "9.9.9.9", userAgent: "ua", requestId: "req-1", reason: "password_change",
    });
    expect(email.sendPasswordChangedEmail).toHaveBeenCalledWith(user, { ipAddress: "9.9.9.9", requestId: "req-1" });
  });

  it("records a security event carrying the request id", async () => {
    const { service, events } = build();
    await service.afterPasswordChange({
      user, ip: "9.9.9.9", userAgent: "ua", requestId: "req-1", reason: "password_change",
    });
    expect(events.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: SecurityEventType.PASSWORD_CHANGED,
        requestId: "req-1",
        userId: "u1",
        tenantId: "t1",
        metadata: { reason: "password_change", revokedSessions: 2 },
      }),
    );
  });

  it("uses the supplied event type", async () => {
    const { service, events } = build();
    await service.afterPasswordChange({
      user, ip: "i", userAgent: "ua", reason: "password_reset",
      eventType: SecurityEventType.PASSWORD_RESET_COMPLETED,
    });
    expect(events.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: SecurityEventType.PASSWORD_RESET_COMPLETED }),
    );
  });
});
