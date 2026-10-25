import type { ConfigService } from "@nestjs/config";
import { createMailer } from "./mailer.factory";
import { ProviderMailer } from "./mailers/provider.mailer";
import { ConsoleMailer } from "./mailers/console.mailer";
import { logger } from "@/common/logger";

jest.mock("@/common/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/modules/email/providers/ses.provider", () => ({ SESProvider: jest.fn().mockImplementation(() => ({ name: "ses", sendEmail: jest.fn() })) }));
jest.mock("@/modules/email/providers/nodemailer.provider", () => ({ NodeMailerProvider: jest.fn().mockImplementation(() => ({ name: "smtp", sendEmail: jest.fn() })) }));

import { SESProvider } from "@/modules/email/providers/ses.provider";
import { NodeMailerProvider } from "@/modules/email/providers/nodemailer.provider";

const config = (v: Record<string, string>) => ({ get: (k: string) => v[k] }) as unknown as ConfigService;

describe("createMailer provider selection", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prefers SES when both keys are set, even if SMTP is also configured", () => {
    const m = createMailer(config({ AWS_SES_ACCESS_KEY_ID: "a", AWS_SES_SECRET_ACCESS_KEY: "s", SMTP_HOST: "h" }));
    expect(m).toBeInstanceOf(ProviderMailer);
    expect(SESProvider).toHaveBeenCalled();
    expect(NodeMailerProvider).not.toHaveBeenCalled();
  });

  it("does not choose SES with only one of the two keys", () => {
    expect(createMailer(config({ AWS_SES_ACCESS_KEY_ID: "a", NODE_ENV: "development" }))).toBeInstanceOf(ConsoleMailer);
    expect(createMailer(config({ AWS_SES_SECRET_ACCESS_KEY: "s", SMTP_HOST: "h" }))).toBeInstanceOf(ProviderMailer);
    expect(SESProvider).not.toHaveBeenCalled();
  });

  it("uses SMTP when SMTP_HOST is set (and in production)", () => {
    expect(createMailer(config({ SMTP_HOST: "h", NODE_ENV: "production" }))).toBeInstanceOf(ProviderMailer);
    expect(NodeMailerProvider).toHaveBeenCalled();
  });

  it("warns on the console fallback and never in production", () => {
    createMailer(config({}));
    expect(logger.warn).toHaveBeenCalled();
    expect(() => createMailer(config({ NODE_ENV: "production" }))).toThrow(/No mail provider configured/);
  });
});

describe("ProviderMailer / ConsoleMailer", () => {
  it("ProviderMailer maps OutgoingMail to provider.sendEmail and propagates failures", async () => {
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const mailer = new ProviderMailer({ sendEmail } as never);
    await mailer.send({ to: "a@x", subject: "s", html: "<p>", text: "t" });
    expect(sendEmail).toHaveBeenCalledWith({ to: "a@x", subject: "s", html: "<p>", text: "t" });
    sendEmail.mockRejectedValue(new Error("fail"));
    await expect(mailer.send({ to: "a", subject: "s", html: "h", text: "t" })).rejects.toThrow("fail");
  });

  it("ConsoleMailer logs recipient/subject and the text body only", async () => {
    await new ConsoleMailer().send({ to: "a@x", subject: "S", html: "<secret-html/>", text: "link: https://x" });
    expect(logger.info).toHaveBeenCalledWith({ to: "a@x", subject: "S" }, "[mail:console]\nlink: https://x");
  });
});
