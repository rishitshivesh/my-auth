import * as nodemailer from "nodemailer";
import { SendEmailCommand, VerifyEmailIdentityCommand } from "@aws-sdk/client-ses";
import { NodeMailerProvider } from "./nodemailer.provider";
import { SESProvider } from "./ses.provider";

const sendMail = jest.fn();
const verifyFn = jest.fn();
jest.mock("nodemailer", () => ({ createTransport: jest.fn(() => ({ sendMail: (...a: unknown[]) => sendMail(...a), verify: () => verifyFn() })) }));

const sesSend = jest.fn();
jest.mock("@aws-sdk/client-ses", () => ({
  SESClient: jest.fn(() => ({ send: (...a: unknown[]) => sesSend(...a) })),
  SendEmailCommand: jest.fn((input: unknown) => ({ kind: "send", input })),
  VerifyEmailIdentityCommand: jest.fn((input: unknown) => ({ kind: "verify", input })),
}));

const cfg = (vals: Record<string, unknown>) => ({
  get: (k: string, d?: unknown) => (k in vals ? vals[k] : d),
});

const VALS = {
  SMTP_HOST: "smtp.test", SMTP_PORT: 2525, SMTP_SECURE: "true", SMTP_USER: "u", SMTP_PASS: "p",
  EMAIL_FROM_NAME: "Sentry", EMAIL_FROM: "no-reply@x.test", EMAIL_REPLY_TO: "help@x.test",
  AWS_SES_REGION: "eu-west-1", AWS_SES_ACCESS_KEY_ID: "AK", AWS_SES_SECRET_ACCESS_KEY: "SK",
};

beforeEach(() => {
  sendMail.mockReset(); verifyFn.mockReset(); sesSend.mockReset();
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("NodeMailerProvider", () => {
  it("configures pooled transport from config", () => {
    new NodeMailerProvider(cfg(VALS) as never);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.test", port: 2525, secure: true, auth: { user: "u", pass: "p" }, pool: true,
    }));
  });

  it("defaults port 587 and secure=false", () => {
    new NodeMailerProvider(cfg({ SMTP_HOST: "h" }) as never);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false }));
  });

  it("sends with default from/replyTo and joins recipient lists", async () => {
    sendMail.mockResolvedValue({ messageId: "m1" });
    const p = new NodeMailerProvider(cfg(VALS) as never);
    await p.sendEmail({ to: ["a@x", "b@x"], subject: "S", html: "<b>h</b>", cc: ["c@x", "d@x"], bcc: "e@x" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: '"Sentry" <no-reply@x.test>', to: "a@x, b@x", cc: "c@x, d@x", bcc: "e@x", replyTo: "help@x.test", subject: "S",
    }));
  });

  it("explicit from/replyTo/string recipients override defaults; absent cc/bcc are undefined", async () => {
    sendMail.mockResolvedValue({ messageId: "m" });
    const p = new NodeMailerProvider(cfg(VALS) as never);
    await p.sendEmail({ to: "a@x", subject: "S", html: "h", from: "f@x", replyTo: "r@x", cc: "c@x" });
    const arg = sendMail.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ from: "f@x", replyTo: "r@x", to: "a@x", cc: "c@x", bcc: undefined });
  });

  it("rethrows transport errors", async () => {
    sendMail.mockRejectedValue(new Error("smtp down"));
    const p = new NodeMailerProvider(cfg(VALS) as never);
    await expect(p.sendEmail({ to: "a@x", subject: "s", html: "h" })).rejects.toThrow("smtp down");
  });

  it("verify returns true/false and name is smtp", async () => {
    const p = new NodeMailerProvider(cfg(VALS) as never);
    verifyFn.mockResolvedValueOnce(true);
    expect(await p.verify()).toBe(true);
    verifyFn.mockRejectedValueOnce(new Error("x"));
    expect(await p.verify()).toBe(false);
    expect(p.getProviderName()).toBe("smtp");
  });
});

describe("SESProvider", () => {
  it("sends SendEmailCommand with arrays, charset and reply-to", async () => {
    sesSend.mockResolvedValue({ MessageId: "id" });
    const p = new SESProvider(cfg(VALS) as never);
    await p.sendEmail({ to: "a@x", subject: "S", html: "<p>", text: "t", cc: "c@x", bcc: ["b1", "b2"] });
    const input = (SendEmailCommand as unknown as jest.Mock).mock.calls[0]?.[0];
    expect(input).toMatchObject({
      Source: '"Sentry" <no-reply@x.test>',
      Destination: { ToAddresses: ["a@x"], CcAddresses: ["c@x"], BccAddresses: ["b1", "b2"] },
      Message: { Subject: { Data: "S", Charset: "UTF-8" }, Body: { Html: { Data: "<p>" }, Text: { Data: "t" } } },
      ReplyToAddresses: ["help@x.test"],
    });
  });

  it("omits optional parts when absent", async () => {
    sesSend.mockResolvedValue({});
    const p = new SESProvider(cfg({ ...VALS, EMAIL_REPLY_TO: undefined }) as never);
    await p.sendEmail({ to: ["a", "b"], subject: "S", html: "h", from: "f@x" });
    const input = (SendEmailCommand as unknown as jest.Mock).mock.calls[0]?.[0];
    expect(input.Source).toBe("f@x");
    expect(input.Destination).toEqual({ ToAddresses: ["a", "b"], CcAddresses: undefined, BccAddresses: undefined });
    expect(input.Message.Body.Text).toBeUndefined();
    expect(input.ReplyToAddresses).toBeUndefined();
  });

  it("rethrows send errors", async () => {
    sesSend.mockRejectedValue(new Error("throttled"));
    const p = new SESProvider(cfg(VALS) as never);
    await expect(p.sendEmail({ to: "a", subject: "s", html: "h" })).rejects.toThrow("throttled");
  });

  it("verify is true and name is ses", async () => {
    const p = new SESProvider(cfg(VALS) as never);
    expect(await p.verify()).toBe(true);
    expect(p.getProviderName()).toBe("ses");
  });

  it("verifyEmailIdentity sends command; propagates errors", async () => {
    sesSend.mockResolvedValueOnce({});
    const p = new SESProvider(cfg(VALS) as never);
    await p.verifyEmailIdentity("x@y");
    expect((VerifyEmailIdentityCommand as unknown as jest.Mock).mock.calls[0]?.[0]).toEqual({ EmailAddress: "x@y" });
    sesSend.mockRejectedValueOnce(new Error("denied"));
    await expect(p.verifyEmailIdentity("x@y")).rejects.toThrow("denied");
  });
});
