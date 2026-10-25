import type { Repository } from "typeorm";
import type { SecurityEvent } from "@repo/database";
import { SecurityEventService } from "./security-event.service";
import { tenantStorage } from "@/core/database/tenant-context.service";

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
      { transaction: false },
    );
  });

  it("honours an explicit failure outcome", async () => {
    const { save, service } = build();
    service.log({ ...base, outcome: "failure" });
    await new Promise(process.nextTick);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failure" }), {
      transaction: false,
    });
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

describe("SecurityEventService domain event publishing", () => {
  const tick = () => new Promise(process.nextTick);
  function withBus(saveImpl: jest.Mock) {
    const publish = jest.fn();
    const service = new SecurityEventService({ save: saveImpl } as unknown as Repository<SecurityEvent>, { publish } as never);
    return { publish, service };
  }

  it("publishes a SECURITY_EVENT only after the audit row is written, with redacted metadata", async () => {
    const { publish, service } = withBus(jest.fn().mockResolvedValue({ id: "se-1" }));
    service.log({ ...base, userId: "u1", actorEmail: "u@x.test", requestId: "r1", metadata: { code: "123456", reason: "x" } });
    expect(publish).not.toHaveBeenCalled();
    await tick();
    expect(publish).toHaveBeenCalledWith("security.event", expect.objectContaining({
      tenantId: "t1", userId: "u1", email: "u@x.test", requestId: "r1", securityEventId: "se-1",
      securityEventType: "auth.login_failed", outcome: "success", metadata: { code: "[redacted]", reason: "x" },
    }));
  });

  it("does not publish a success event whose audit write failed", async () => {
    const { publish, service } = withBus(jest.fn().mockRejectedValue(new Error("rolled back")));
    service.log(base);
    await tick();
    expect(publish).not.toHaveBeenCalled();
  });

  it("still publishes a failed attempt when its audit row could not be written", async () => {
    const { publish, service } = withBus(jest.fn().mockRejectedValue(new Error("rolled back")));
    service.log({ ...base, outcome: "failure" });
    await tick();
    expect(publish).toHaveBeenCalledWith("security.event", expect.objectContaining({ outcome: "failure", securityEventId: undefined }));
  });

  it("inside a tenant request writes on its own connection pinned to the captured schema", async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const release = jest.fn().mockResolvedValue(undefined);
    const managerSave = jest.fn().mockResolvedValue({ id: "ev1" });
    const ownRunner = { connect: jest.fn(), query, release, manager: { save: managerSave } };
    const requestRunner = { connection: { createQueryRunner: () => ownRunner } };
    const { save, service } = build();
    tenantStorage.run({ queryRunner: requestRunner as never, schemaName: "fk_acme" }, () => service.log({ ...base }));
    await new Promise((r) => setTimeout(r, 10));
    expect(query).toHaveBeenNthCalledWith(1, 'SET search_path TO "fk_acme", public');
    expect(managerSave).toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
