import * as crypto from "crypto";
import { BadRequestException } from "@nestjs/common";
import { OAuthTokenService } from "./oauth-token.service";

/** validatePKCE() is pure; call it without constructing the service graph. */
const validatePKCE = (verifier: string, challenge: string, method: string) =>
  OAuthTokenService.prototype.validatePKCE.call({}, verifier, challenge, method);

const s256 = (verifier: string) =>
  crypto.createHash("sha256").update(verifier).digest("base64url");

describe("OAuthTokenService.validatePKCE (S256 only)", () => {
  // 32 random bytes, base64url → 43-char verifier, as RFC 7636 §4.1 recommends
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = s256(verifier);

  it("accepts a matching S256 verifier", async () => {
    await expect(validatePKCE(verifier, challenge, "S256")).resolves.toBe(true);
  });

  it("rejects a verifier that does not match the challenge", async () => {
    const other = "x".repeat(43);
    await expect(validatePKCE(other, challenge, "S256")).resolves.toBe(false);
  });

  it("rejects verifiers outside the RFC 7636 length/charset", async () => {
    await expect(validatePKCE("short", s256("short"), "S256")).resolves.toBe(false);
    const bad = "a".repeat(42) + "!";
    await expect(validatePKCE(bad, s256(bad), "S256")).resolves.toBe(false);
  });

  it("refuses the plain method, even when verifier equals challenge", async () => {
    const plain = "p".repeat(43);
    await expect(validatePKCE(plain, plain, "plain")).rejects.toThrow(BadRequestException);
  });
});
