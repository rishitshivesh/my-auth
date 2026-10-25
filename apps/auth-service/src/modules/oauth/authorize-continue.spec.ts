import { buildAuthorizeContinue, isSafeAuthorizeContinue } from "./authorize-continue";

describe("authorize continue URL", () => {
  it("builds a relative authorize URL from the given params, skipping empties", () => {
    const url = buildAuthorizeContinue({ client_id: "c", state: undefined, max_age: 0, scope: "openid email" });
    expect(url).toBe("/oauth/authorize?client_id=c&max_age=0&scope=openid+email");
    expect(isSafeAuthorizeContinue(url)).toBe(true);
  });

  it.each([
    "/oauth/authorize",
    "/oauth/authorize?client_id=c&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb",
  ])("accepts %s", (value) => expect(isSafeAuthorizeContinue(value)).toBe(true));

  it.each([
    ["absolute URL", "https://evil.example.com/oauth/authorize"],
    ["protocol-relative", "//evil.example.com/oauth/authorize"],
    ["other path", "/oauth/token"],
    ["prefix path", "/oauth/authorize/../token"],
    ["look-alike path", "/oauth/authorizeevil"],
    ["backslash trick", "/\\\\evil.example.com"],
    ["scheme", "javascript:alert(1)"],
    ["control chars", "/oauth/authorize\\r\\nLocation: x"],
    ["empty", ""],
    ["not a string", 42],
    ["too long", `/oauth/authorize?${"a".repeat(5000)}`],
  ])("rejects %s", (_n, value) => expect(isSafeAuthorizeContinue(value)).toBe(false));
});
