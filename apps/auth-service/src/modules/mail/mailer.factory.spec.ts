import type { ConfigService } from "@nestjs/config";
import { createMailer } from "./mailer.factory";
import { ConsoleMailer } from "./mailers/console.mailer";

jest.mock("@/common/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const config = (values: Record<string, string>): ConfigService =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

describe("createMailer", () => {
  it("uses the console mailer outside production when nothing is configured", () => {
    expect(createMailer(config({ NODE_ENV: "development" }))).toBeInstanceOf(ConsoleMailer);
  });

  it("refuses the console mailer in production", () => {
    expect(() => createMailer(config({ NODE_ENV: "production" }))).toThrow(/production/);
  });
});
