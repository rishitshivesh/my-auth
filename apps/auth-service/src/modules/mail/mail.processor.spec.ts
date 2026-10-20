import type { Job } from "bullmq";
import { MailProcessor } from "./mail.processor";
import type { MailJob } from "./mail.constants";
import type { MailerPort } from "./mailer.port";

const mockRender = jest.fn();
const mockIsEmailName = jest.fn();
jest.mock(
  "@repo/emails",
  () => ({
    renderEmail: (...a: unknown[]) => mockRender(...a),
    isEmailName: (n: unknown) => mockIsEmailName(n),
  }),
  { virtual: true },
);
jest.mock("@/common/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const makeJob = (data: Partial<MailJob>): Job<MailJob> =>
  ({ id: "1", attemptsMade: 0, data: { template: "otp-code", to: "a@b.co", props: {}, ...data } }) as unknown as Job<MailJob>;

describe("MailProcessor", () => {
  const send = jest.fn();
  const mailer: MailerPort = { send };
  const processor = new MailProcessor(mailer);

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEmailName.mockReturnValue(true);
  });

  it("renders the template and sends the result", async () => {
    mockRender.mockResolvedValue({ subject: "S", html: "<p>h</p>", text: "t" });

    await processor.process(makeJob({ props: { code: "1" } as never }));

    expect(mockRender).toHaveBeenCalledWith("otp-code", { code: "1" });
    expect(send).toHaveBeenCalledWith({ to: "a@b.co", subject: "S", html: "<p>h</p>", text: "t" });
  });

  it("drops jobs with an unknown template without retrying", async () => {
    mockIsEmailName.mockReturnValue(false);

    await expect(processor.process(makeJob({}))).resolves.toBeUndefined();
    expect(mockRender).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rethrows mailer failures so BullMQ retries", async () => {
    mockRender.mockResolvedValue({ subject: "S", html: "h", text: "t" });
    send.mockRejectedValue(new Error("smtp down"));

    await expect(processor.process(makeJob({}))).rejects.toThrow("smtp down");
  });

  it("rethrows render failures", async () => {
    mockRender.mockRejectedValue(new Error("bad props"));

    await expect(processor.process(makeJob({}))).rejects.toThrow("bad props");
  });
});
