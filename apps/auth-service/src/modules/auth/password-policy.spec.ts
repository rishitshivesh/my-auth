import { ApiException } from "@/common/http";
import {
  assertPasswordPolicy,
  checkPasswordPolicy,
  normalizePassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "./password-policy";

const DENY: ReadonlySet<string> = new Set(["password1234"]);

describe("checkPasswordPolicy", () => {
  it("rejects passwords shorter than the minimum", () => {
    expect(checkPasswordPolicy("a".repeat(PASSWORD_MIN_LENGTH - 1), DENY)).toBe("too_short");
  });

  it("rejects passwords longer than the maximum", () => {
    expect(checkPasswordPolicy("ab".repeat(PASSWORD_MAX_LENGTH), DENY)).toBe("too_long");
  });

  it("accepts a password at exactly the minimum length", () => {
    expect(checkPasswordPolicy("abcdefghijkl", DENY)).toBeNull();
  });

  it("rejects a denied password regardless of case", () => {
    expect(checkPasswordPolicy("PassWord1234", DENY)).toBe("too_common");
  });

  it("rejects trivially repetitive passwords", () => {
    expect(checkPasswordPolicy("abababababab", DENY)).toBe("too_repetitive");
  });

  it("rejects passwords containing the email local part", () => {
    expect(checkPasswordPolicy("xx-rishitshivesh-xx", DENY, { email: "RishitShivesh@example.com" })).toBe(
      "contains_email",
    );
  });

  it("ignores very short email local parts", () => {
    expect(checkPasswordPolicy("my-ab-secret-phrase", DENY, { email: "ab@example.com" })).toBeNull();
  });

  it("counts characters after NFKC normalisation, not UTF-16 units", () => {
    // 12 full-width letters fold to 12 ASCII letters
    expect(checkPasswordPolicy("ａｂｃｄｅｆｇｈｉｊｋｌ", DENY)).toBeNull();
  });
});

describe("normalizePassword", () => {
  it("folds full-width characters to ASCII", () => {
    expect(normalizePassword("ＡＢＣ")).toBe("ABC");
  });
});

describe("assertPasswordPolicy", () => {
  it("throws PASSWORD_POLICY with a password field error", () => {
    expect.assertions(3);
    try {
      assertPasswordPolicy("short");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).code).toBe("PASSWORD_POLICY");
      expect((err as ApiException).errors?.[0]?.field).toBe("password");
    }
  });

  it("rejects entries from the bundled common-password list", () => {
    expect(() => assertPasswordPolicy("qwerty123456")).toThrow(ApiException);
  });

  it("accepts a long unique passphrase", () => {
    expect(() => assertPasswordPolicy("correct horse battery staple")).not.toThrow();
  });
});
