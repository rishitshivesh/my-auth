import { MailService } from "./mail.service";
import { MAIL_QUEUE } from "./mail.constants";
import type { Queue } from "bullmq";

jest.mock("@/common/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

describe("MailService", () => {
  const add = jest.fn();
  const service = new MailService({ add } as unknown as Queue);

  beforeEach(() => add.mockReset());

  it("enqueues a job with retry and retention options and returns true", async () => {
    add.mockResolvedValue({});

    const ok = await service.send("otp-code" as never, "a@b.co", { code: "1" } as never);

    expect(ok).toBe(true);
    expect(MAIL_QUEUE).toBe("mail.send");
    expect(add).toHaveBeenCalledWith(
      "otp-code",
      { template: "otp-code", to: "a@b.co", props: { code: "1" } },
      expect.objectContaining({
        attempts: 3,
        backoff: expect.objectContaining({ type: "exponential" }),
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      }),
    );
  });

  it("returns false and does not throw when the queue is unavailable", async () => {
    add.mockRejectedValue(new Error("redis down"));

    await expect(
      service.send("otp-code" as never, "a@b.co", {} as never),
    ).resolves.toBe(false);
  });
});
