import { PasswordService } from "@repo/security";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password-hashing";

jest.mock("@repo/security", () => ({
  PasswordService: { hash: jest.fn(), verify: jest.fn() },
}));

const hash = PasswordService.hash as jest.Mock;
const verify = PasswordService.verify as jest.Mock;

describe("password hashing", () => {
  beforeEach(() => {
    hash.mockReset().mockResolvedValue("hashed");
    verify.mockReset();
  });

  it("hashes the NFKC-normalised password", async () => {
    await hashPassword("ＡＢＣ");
    expect(hash).toHaveBeenCalledWith("ABC");
  });

  it("verifies the normalised form first", async () => {
    verify.mockResolvedValueOnce(true);
    await expect(verifyPassword("h", "ＡＢＣ")).resolves.toBe(true);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith("h", "ABC");
  });

  it("falls back to the raw form for hashes created before normalisation", async () => {
    verify.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(verifyPassword("h", "ＡＢＣ")).resolves.toBe(true);
    expect(verify).toHaveBeenLastCalledWith("h", "ＡＢＣ");
  });

  it("does not verify twice when normalisation changes nothing", async () => {
    verify.mockResolvedValue(false);
    await expect(verifyPassword("h", "abc")).resolves.toBe(false);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("burns one verification against a dummy hash and returns false", async () => {
    verify.mockResolvedValue(true);
    await expect(verifyAgainstDummy("whatever")).resolves.toBe(false);
    expect(verify).toHaveBeenCalledWith("hashed", "whatever");
  });
});
