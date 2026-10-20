import { DomainEventName, DomainEventsService } from "@/common/service/domain-events.service";
import type { MailService } from "@/modules/mail";
import { SecurityNotifierService } from "./security-notifier.service";

jest.mock("@/modules/mail", () => ({ MailService: class {} }));

const flush = () => new Promise((r) => setImmediate(r));

function setup() {
  const bus = new DomainEventsService();
  const send = jest.fn().mockResolvedValue(true);
  const svc = new SecurityNotifierService(bus, { send } as unknown as MailService);
  svc.onModuleInit();
  return { bus, send };
}

describe("SecurityNotifierService", () => {
  it("sends a session reuse alert with request id and formatted time", async () => {
    const { bus, send } = setup();
    bus.publish(DomainEventName.SESSION_REFRESH_REUSE_DETECTED, {
      tenantId: "t", email: "a@b.co", name: "Ann", ip: "1.1.1.1", requestId: "req-1",
    });
    await flush();
    expect(send).toHaveBeenCalledWith(
      "session-reuse-alert",
      "a@b.co",
      expect.objectContaining({ name: "Ann", ip: "1.1.1.1", requestId: "req-1", when: expect.stringMatching(/UTC$/) }),
    );
  });

  it("skips when there is no recipient", async () => {
    const { bus, send } = setup();
    bus.publish(DomainEventName.MFA_ENABLED, { tenantId: "t" });
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("notifies both parties on ownership transfer", async () => {
    const { bus, send } = setup();
    bus.publish(DomainEventName.OWNERSHIP_TRANSFERRED, {
      tenantId: "t", email: "old@x.co", name: "Old", targetEmail: "new@x.co", targetName: "New", tenantName: "Acme",
    });
    await flush();
    expect(send).toHaveBeenCalledWith("ownership-transferred-from", "old@x.co", expect.objectContaining({ newOwnerName: "New" }));
    expect(send).toHaveBeenCalledWith("ownership-transferred-to", "new@x.co", expect.objectContaining({ previousOwnerName: "Old" }));
  });

  it("uses a default unlock duration for account-locked", async () => {
    const { bus, send } = setup();
    bus.publish(DomainEventName.ACCOUNT_LOCKED, { tenantId: "t", email: "a@b.co" });
    await flush();
    expect(send).toHaveBeenCalledWith("account-locked", "a@b.co", expect.objectContaining({ unlockMinutes: 15 }));
  });
});
