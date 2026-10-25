import { DomainEventName, DomainEventsService } from "@/common/service/domain-events.service";
import type { MailService } from "@/modules/mail";
import { SecurityNotifierService, formatWhen } from "./security-notifier.service";

jest.mock("@/modules/mail", () => ({ MailService: class {} }));

const flush = () => new Promise((r) => setImmediate(r));

function setup() {
  const bus = new DomainEventsService();
  const send = jest.fn().mockResolvedValue(true);
  new SecurityNotifierService(bus, { send } as unknown as MailService).onModuleInit();
  return { bus, send };
}

describe("formatWhen", () => {
  it.each([
    ["2026-10-14T10:32:00Z", "14 Oct 2026, 10:32 UTC"],
    ["2026-01-01T00:00:00Z", "01 Jan 2026, 00:00 UTC"],
    ["2026-12-31T23:59:59Z", "31 Dec 2026, 23:59 UTC"],
  ])("formats %s in UTC 24h", (iso, expected) => {
    expect(formatWhen(new Date(iso))).toBe(expected);
  });
});

describe("SecurityNotifierService event routing", () => {
  it.each([
    [DomainEventName.SESSION_REFRESH_REUSE_DETECTED, "session-reuse-alert"],
    [DomainEventName.PASSKEY_REMOVED, "passkey-removed"],
    [DomainEventName.MFA_ENABLED, "mfa-enabled"],
    [DomainEventName.MFA_DISABLED, "mfa-disabled"],
    [DomainEventName.PASSWORD_CHANGED, "password-changed"],
  ])("%s -> %s with defaults for missing name/ip", async (event, template) => {
    const { bus, send } = setup();
    bus.publish(event, { tenantId: "t", email: "u@x.co" });
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(template, "u@x.co", expect.objectContaining({ ip: null, name: expect.any(String), tenantName: undefined }));
  });

  it("account-locked passes explicit unlockMinutes, ip and tenant", async () => {
    const { bus, send } = setup();
    bus.publish(DomainEventName.ACCOUNT_LOCKED, { tenantId: "t", email: "u@x.co", name: "U", ip: "9.9.9.9", unlockMinutes: 45, tenantName: "Acme", requestId: "r" });
    await flush();
    expect(send).toHaveBeenCalledWith("account-locked", "u@x.co", expect.objectContaining({ unlockMinutes: 45, ip: "9.9.9.9", name: "U", tenantName: "Acme", requestId: "r" }));
  });

  it("account-locked without recipient is skipped", async () => {
    const { bus, send } = setup();
    bus.publish(DomainEventName.ACCOUNT_LOCKED, { tenantId: "t" });
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("ownership transfer with only the new owner email notifies only them; with none notifies nobody", async () => {
    const { bus, send } = setup();
    bus.publish(DomainEventName.OWNERSHIP_TRANSFERRED, { tenantId: "t", targetEmail: "new@x.co" });
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("ownership-transferred-to", "new@x.co", expect.objectContaining({ tenantName: "", ip: null }));
    send.mockClear();
    bus.publish(DomainEventName.OWNERSHIP_TRANSFERRED, { tenantId: "t" });
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("ownership transfer with only the previous owner email notifies only them", async () => {
    const { bus, send } = setup();
    bus.publish(DomainEventName.OWNERSHIP_TRANSFERRED, { tenantId: "t", email: "old@x.co" });
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBe("ownership-transferred-from");
  });
});
