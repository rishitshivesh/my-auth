import * as speakeasy from "speakeasy";

export const totpNow = (secret: string, offsetSteps = 0): string =>
  speakeasy.totp({ secret, encoding: "base32", time: Math.floor(Date.now() / 1000) + offsetSteps * 30 });
