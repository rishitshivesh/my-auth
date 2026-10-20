import { DomainEventName, DomainEventsService } from "./domain-events.service";

const flush = () => new Promise((r) => setImmediate(r));

describe("DomainEventsService", () => {
  it("delivers events to subscribers", async () => {
    const bus = new DomainEventsService();
    const handler = jest.fn();
    bus.on(DomainEventName.ACCOUNT_LOCKED, handler);
    bus.publish(DomainEventName.ACCOUNT_LOCKED, { tenantId: "t", userId: "u" });
    await flush();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: "account.locked", payload: { tenantId: "t", userId: "u" } }),
    );
  });

  it("a failing handler does not break the caller or other handlers", async () => {
    const bus = new DomainEventsService();
    const ok = jest.fn();
    bus.on(DomainEventName.MFA_ENABLED, () => {
      throw new Error("boom");
    });
    bus.on(DomainEventName.MFA_ENABLED, ok);
    expect(() => bus.publish(DomainEventName.MFA_ENABLED, { tenantId: "t" })).not.toThrow();
    await flush();
    expect(ok).toHaveBeenCalled();
  });

  it("unsubscribe stops delivery", async () => {
    const bus = new DomainEventsService();
    const h = jest.fn();
    bus.on(DomainEventName.MFA_DISABLED, h)();
    bus.publish(DomainEventName.MFA_DISABLED, { tenantId: "t" });
    await flush();
    expect(h).not.toHaveBeenCalled();
  });
});
