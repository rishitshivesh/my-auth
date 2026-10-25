import { EMPTY_WEBHOOK_DRAFT, canRedeliver, deliveryKind, toggleEvent, toWebhookBody, validateWebhookDraft } from "./webhooks";

describe("webhooks", () => {
  it("wildcard and specific events are exclusive", () => {
    expect(toggleEvent(["user.created"], "*")).toEqual(["*"]);
    expect(toggleEvent(["*"], "user.created")).toEqual(["user.created"]);
    expect(toggleEvent(["user.created"], "user.created")).toEqual([]);
  });
  it("validates url and events", () => {
    expect(validateWebhookDraft(EMPTY_WEBHOOK_DRAFT)).toEqual(["url", "events"]);
    expect(toWebhookBody({ url: " https://x.test/h ", description: "", events: ["*"] })).toEqual({ url: "https://x.test/h", events: ["*"] });
  });
  it("only settled deliveries can be redelivered", () => {
    expect(canRedeliver("failed")).toBe(true);
    expect(canRedeliver("pending")).toBe(false);
    expect(deliveryKind("weird")).toBe("pending");
  });
});
