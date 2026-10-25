import { isAllowedReturnOrigin } from "./return-origin";

describe("isAllowedReturnOrigin (open-redirect guard)", () => {
  const allowed = new Set(["https://portal.example.com"]);

  it("accepts exact origin with any path", () => {
    expect(isAllowedReturnOrigin("https://portal.example.com", allowed)).toBe(true);
    expect(isAllowedReturnOrigin("https://portal.example.com/dash?x=1", allowed)).toBe(true);
  });

  it.each([
    "https://portal.example.com.evil.test",
    "https://portal.example.com@evil.test",
    "https://evil.test/https://portal.example.com",
    "http://portal.example.com",
    "javascript:alert(1)",
    "//evil.test",
    "https://portal.example.com:8443",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isAllowedReturnOrigin(url, allowed)).toBe(false);
  });
});
