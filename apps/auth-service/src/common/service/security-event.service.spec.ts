import type { Repository } from "typeorm";
import type { SecurityEvent } from "@repo/database";
import { SecurityEventService } from "./security-event.service";

function build() {
  const save = jest.fn().mockResolvedValue(undefined);
  const repo = { save } as unknown as Repository<SecurityEvent>;
  return { save, service: new SecurityEventService(repo) };
}

const base = {
  tenantId: "t1",
  eventType: "auth.login_failed",
  severity: "info",
  ipAddress: "1.2.3.4",
  userAgent: "jest",
} as const;

describe("SecurityEventService", () => {
  it("persists requestId, defaults outcome to success and redacts metadata", async () => {
    const { save, service } = build();
    service.log({ ...base, requestId: "req-12345678", metadata: { code: "123456", reason: "x" } });
    await new Promise(process.nextTick);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-12345678",
        outcome: "success",
        metadata: { code: "[redacted]", reason: "x" },
      }),
    );
  });

  it("honours an explicit failure outcome", async () => {
    const { save, service } = build();
    service.log({ ...base, outcome: "failure" });
    await new Promise(process.nextTick);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failure" }));
  });

  it("never throws when persistence fails", async () => {
    const { save, service } = build();
    save.mockRejectedValue(new Error("db down"));
    expect(() => service.log({ ...base })).not.toThrow();
    await new Promise(process.nextTick);
  });

  it("sanitizeMetadata returns {} for non-objects", () => {
    expect(SecurityEventService.sanitizeMetadata("x")).toEqual({});
  });
});
