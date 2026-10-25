import { extractTenantSlugFromHost } from "./tenant-host";

describe("extractTenantSlugFromHost", () => {
  it("with a platform domain", () => {
    const d = "sentry.example.com";
    expect(extractTenantSlugFromHost("acme.sentry.example.com", d)).toBe("acme");
    expect(extractTenantSlugFromHost("sentry.example.com:443", d)).toBe("sentry");
    expect(extractTenantSlugFromHost("api.sentry.example.com", d)).toBeNull();
    expect(extractTenantSlugFromHost("a.b.sentry.example.com", d)).toBeNull();
    expect(extractTenantSlugFromHost("other.com", d)).toBeNull();
  });
  it("without a platform domain", () => {
    expect(extractTenantSlugFromHost("localhost", null)).toBeNull();
    expect(extractTenantSlugFromHost("10.0.0.1", null)).toBeNull();
    expect(extractTenantSlugFromHost("acme.example.com", null)).toBe("acme");
    expect(extractTenantSlugFromHost("www.example.com", null)).toBeNull();
    expect(extractTenantSlugFromHost("example.com", null)).toBeNull();
  });
});
