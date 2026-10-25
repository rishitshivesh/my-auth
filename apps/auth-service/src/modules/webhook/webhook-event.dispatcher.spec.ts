import { DomainEventName, DomainEventsService } from "@/common/service/domain-events.service";
import { WebhookEventDispatcher, WEBHOOK_EVENT_TYPES, buildWebhookData } from "./webhook-event.dispatcher";
import { EVENT_DISPATCH_DELAY_MS } from "./webhook.service";

const flush = () => new Promise((r) => setImmediate(r));

function build(tenant: { id: string; slug: string } | null = { id: "t1", slug: "acme" }) {
  const events = new DomainEventsService();
  const webhooks = { emit: jest.fn().mockResolvedValue(undefined) };
  const runInTenant = jest.fn((_slug: string, work: () => Promise<unknown>) => work());
  const dataSource = { manager: { findOne: jest.fn().mockResolvedValue(tenant) } };
  const dispatcher = new WebhookEventDispatcher(events, webhooks as never, { runInTenant } as never, dataSource as never);
  dispatcher.onModuleInit();
  return { events, webhooks, runInTenant, dataSource };
}

const publish = (events: DomainEventsService, securityEventType: string, extra: Record<string, unknown> = {}) =>
  events.publish(DomainEventName.SECURITY_EVENT, {
    tenantId: "t1", userId: "u1", email: "u@x.test", securityEventType, securityEventId: "se1", outcome: "success", ...extra,
  });

describe("WebhookEventDispatcher", () => {
  it.each([
    ["auth.login_success", "user.login"],
    ["auth.login_failed", "login.failed"],
    ["user.registered", "user.created"],
    ["user.updated", "user.updated"],
    ["user.deleted", "user.deleted"],
    ["password.changed", "password.changed"],
    ["mfa.totp_enabled", "mfa.enabled"],
    ["mfa.totp_disabled", "mfa.disabled"],
    ["session.revoked", "session.revoked"],
    ["rbac.role_assigned", "role.assigned"],
    ["rbac.role_removed", "role.removed"],
    ["tenant.settings_updated", "tenant.updated"],
  ])("maps %s to %s and emits it for the event's tenant only, in that tenant's context", async (audit, type) => {
    const { events, webhooks, runInTenant } = build();
    publish(events, audit);
    await flush();
    await flush();
    expect(runInTenant).toHaveBeenCalledWith("acme", expect.any(Function));
    expect(webhooks.emit).toHaveBeenCalledWith("t1", type, expect.any(Object), {
      occurredAt: expect.any(Date), delayMs: EVENT_DISPATCH_DELAY_MS,
    });
  });

  it("ignores audit events that are not part of the catalog", async () => {
    const { events, webhooks, dataSource } = build();
    publish(events, "email.sent");
    publish(events, "auth.token_refreshed");
    await flush();
    expect(webhooks.emit).not.toHaveBeenCalled();
    expect(dataSource.manager.findOne).not.toHaveBeenCalled();
  });

  it("drops events for an unknown tenant instead of emitting without context", async () => {
    const { events, webhooks } = build(null);
    publish(events, "auth.login_success");
    await flush();
    await flush();
    expect(webhooks.emit).not.toHaveBeenCalled();
  });

  it("exposes a stable data payload with ids and the event's email only, plus whitelisted metadata", () => {
    const data = buildWebhookData({
      name: DomainEventName.SECURITY_EVENT,
      occurredAt: new Date(),
      payload: {
        tenantId: "t1", userId: "u1", email: "u@x.test", ip: "9.9.9.9", requestId: "r1",
        resourceId: "s1", resourceType: "session", outcome: "success",
        metadata: { roles: ["admin"], reason: "x", userAgent: "secret-ua", newEmail: "n@x.test", authMethod: "password" },
      },
    });
    expect(data).toEqual({
      userId: "u1", email: "u@x.test", resourceId: "s1", resourceType: "session", outcome: "success", requestId: "r1",
      metadata: { roles: ["admin"], reason: "x", authMethod: "password" },
    });
    expect(JSON.stringify(data)).not.toMatch(/9\.9\.9\.9|secret-ua|n@x\.test/);
  });

  it("documents every public event type", () => {
    expect([...new Set(Object.values(WEBHOOK_EVENT_TYPES))].sort()).toEqual([
      "login.failed", "mfa.disabled", "mfa.enabled", "password.changed", "role.assigned", "role.removed",
      "session.revoked", "tenant.updated", "user.created", "user.deleted", "user.login", "user.updated",
    ]);
  });
});
