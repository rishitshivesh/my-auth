import { emailBucketKey, foldEmail } from "./email-key";

describe("foldEmail", () => {
  it("trims and lowercases", () => {
    expect(foldEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  it("merges the Kelvin sign with k", () => {
    expect(foldEmail("Kate@example.com")).toBe(foldEmail("kate@example.com"));
  });

  it("merges full-width and ASCII spellings", () => {
    expect(foldEmail("ｕｓｅｒ@example.com")).toBe("user@example.com");
  });
});

describe("emailBucketKey", () => {
  it("is stable across spellings of the same address", () => {
    expect(emailBucketKey("login", "A@B.com")).toBe(emailBucketKey("login", " a@b.COM"));
  });

  it("never contains the address", () => {
    expect(emailBucketKey("login", "secret@example.com")).not.toContain("secret");
  });

  it("separates scopes", () => {
    expect(emailBucketKey("login", "a@b.com")).not.toBe(emailBucketKey("reset", "a@b.com"));
  });
});
