import { isBlockedWebhookAddress, isLoopbackWebhookAllowed } from "./webhook-loopback";
import { isPrivateIp } from "./private-ip";

describe("webhook loopback test hook", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });
  const set = (nodeEnv: string, flag?: string) => {
    process.env["NODE_ENV"] = nodeEnv;
    if (flag === undefined) delete process.env["WEBHOOK_ALLOW_LOOPBACK"];
    else process.env["WEBHOOK_ALLOW_LOOPBACK"] = flag;
  };

  it("is off by default and in every non-test environment, even with the flag set", () => {
    set("test");
    expect(isLoopbackWebhookAllowed()).toBe(false);
    for (const env of ["production", "development", "staging"]) {
      set(env, "true");
      expect(isLoopbackWebhookAllowed()).toBe(false);
    }
  });

  it("only exempts loopback when NODE_ENV=test and the flag is true", () => {
    set("test", "true");
    expect(isLoopbackWebhookAllowed()).toBe(true);
    expect(isBlockedWebhookAddress("127.0.0.1", isPrivateIp)).toBe(false);
    expect(isBlockedWebhookAddress("127.5.5.5", isPrivateIp)).toBe(false);
    expect(isBlockedWebhookAddress("::1", isPrivateIp)).toBe(false);
  });

  it("keeps every other private or metadata range blocked", () => {
    set("test", "true");
    for (const ip of ["10.0.0.5", "192.168.1.1", "169.254.169.254", "172.16.0.1", "100.64.0.1", "fe80::1"]) {
      expect(isBlockedWebhookAddress(ip, isPrivateIp)).toBe(true);
    }
    expect(isBlockedWebhookAddress("93.184.216.34", isPrivateIp)).toBe(false);
  });

  it("blocks loopback when the hook is off", () => {
    set("production", "true");
    expect(isBlockedWebhookAddress("127.0.0.1", isPrivateIp)).toBe(true);
  });
});
