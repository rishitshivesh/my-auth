import { checkOrigin, normalizeOrigins } from "./cors-origin";

describe("checkOrigin", () => {
  it.each([
    ["https://app.example.com", "https://app.example.com"],
    ["https://App.Example.com:8443", "https://app.example.com:8443"],
    ["https://app.example.com:443", "https://app.example.com"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:8080", "http://127.0.0.1:8080"],
  ])("accepts %s", (input, expected) => {
    expect(checkOrigin(input)).toEqual({ origin: expected });
  });

  it.each([
    "", "  ", "*", "https://*.example.com", "null", "example.com", "http://example.com", "ftp://example.com",
    "javascript:alert(1)", "https://example.com/", "https://example.com/path", "https://example.com?x=1",
    "https://example.com#frag", "https://user:pw@example.com", "http://localhost.evil.com",
  ])("rejects %j", (input) => {
    expect(checkOrigin(input)).toHaveProperty("error");
  });
});

describe("normalizeOrigins", () => {
  it("canonicalises, de-duplicates and reports each invalid entry", () => {
    const res = normalizeOrigins(["https://A.com", "https://a.com", "*", "http://x.com"]);
    expect(res.origins).toEqual(["https://a.com"]);
    expect(res.errors.map((e) => e.value)).toEqual(["*", "http://x.com"]);
  });
});
