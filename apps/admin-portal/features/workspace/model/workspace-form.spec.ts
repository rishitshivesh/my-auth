import { describe, expect, it } from "@jest/globals";
import { buildRegisterBody, canContinueDetails, slugify, validateDetails, validateOwner, validateSlug } from "./workspace-form";

describe("workspace form model", () => {
  it("derives a clean slug", () => {
    expect(slugify("  Northstar Labs!! ")).toBe("northstar-labs");
    expect(slugify("Café Ünïcode")).toBe("cafe-unicode");
  });
  it("validates slug length and format", () => {
    expect(validateSlug("")).toBe("required");
    expect(validateSlug("abc")).toBe("tooShort");
    expect(validateSlug("Bad_Slug")).toBe("format");
    expect(validateSlug("-bad-")).toBe("format");
    expect(validateSlug("good-slug")).toBeUndefined();
  });
  it("validates details and owner", () => {
    expect(validateDetails({ name: "", slug: "ab" })).toEqual({ name: "required", slug: "tooShort" });
    expect(validateOwner({ name: "", email: "x", password: "short" })).toEqual({ name: "required", email: "email", password: "passwordShort" });
    expect(validateOwner({ name: "A", email: "a@b.co", password: "longenough1" })).toEqual({ password: "passwordShort" });
    expect(validateOwner({ name: "A", email: "a@b.co", password: "long-enough-passphrase" })).toEqual({});
  });
  it("only continues once the slug is confirmed available", () => {
    expect(canContinueDetails({}, "checking")).toBe(false);
    expect(canContinueDetails({}, "taken")).toBe(false);
    expect(canContinueDetails({}, "available")).toBe(true);
    expect(canContinueDetails({ name: "required" }, "available")).toBe(false);
  });
  it("normalises the registration body", () => {
    expect(buildRegisterBody({ name: " Acme ", slug: "acme" }, { name: " Ann ", email: " ANN@X.CO ", password: "pw" }, "key-12345678")).toEqual({
      idempotencyKey: "key-12345678", workspaceName: "Acme", slug: "acme", adminName: "Ann", adminEmail: "ann@x.co", adminPassword: "pw",
    });
  });
});
