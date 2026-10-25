import { Request, Response } from "express";
import { ApiException } from "@/common/http";
import { TenantService } from "../../modules/tenant/tenant.service";
import { TenantResolverMiddleware } from "./tenant-resolver.middleware";

type Svc = {
  findByCustomDomain: jest.Mock;
  findBySlug: jest.Mock;
  findById: jest.Mock;
};

const ENV_KEYS = ["SENTRY_PLATFORM_DOMAIN", "NODE_ENV", "ALLOW_TENANT_ID_HEADER"] as const;

function tenant(slug: string, id = `id-${slug}`) {
  return { id, slug };
}

function build(env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const svc: Svc = {
    findByCustomDomain: jest.fn().mockResolvedValue(null),
    findBySlug: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
  };
  const mw = new TenantResolverMiddleware(svc as unknown as TenantService);
  return { svc, mw };
}

async function run(
  mw: TenantResolverMiddleware,
  req: { hostname: string; path?: string; headers?: Record<string, string> },
) {
  const full = { path: "/api/x", headers: {}, ...req } as unknown as Request;
  const next = jest.fn();
  await mw.use(full, {} as Response, next);
  return { req: full, next };
}

describe("TenantResolverMiddleware", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  describe("resolution order", () => {
    it("custom domain wins and sets tenant + tenantId", async () => {
      const { svc, mw } = build();
      svc.findByCustomDomain.mockResolvedValue(tenant("acme"));
      const { req, next } = await run(mw, { hostname: "auth.acme.com" });
      expect(svc.findByCustomDomain).toHaveBeenCalledWith("auth.acme.com");
      expect(svc.findBySlug).not.toHaveBeenCalled();
      expect(req.tenantId).toBe("id-acme");
      expect(req.tenant).toEqual(tenant("acme"));
      expect(next).toHaveBeenCalledWith();
    });

    it("platform exact domain maps to the sentry tenant", async () => {
      const { svc, mw } = build({ SENTRY_PLATFORM_DOMAIN: "sentry.scrolloop.com" });
      svc.findBySlug.mockResolvedValue(tenant("sentry"));
      const { req } = await run(mw, { hostname: "sentry.scrolloop.com" });
      expect(svc.findBySlug).toHaveBeenCalledWith("sentry");
      expect(req.tenantId).toBe("id-sentry");
    });

    it("platform subdomain maps to slug", async () => {
      const { svc, mw } = build({ SENTRY_PLATFORM_DOMAIN: "sentry.scrolloop.com" });
      svc.findBySlug.mockResolvedValue(tenant("acme"));
      const { req } = await run(mw, { hostname: "acme.sentry.scrolloop.com" });
      expect(svc.findBySlug).toHaveBeenCalledWith("acme");
      expect(req.tenantId).toBe("id-acme");
    });

    it("strips a port from the hostname", async () => {
      const { svc, mw } = build({ SENTRY_PLATFORM_DOMAIN: "sentry.scrolloop.com" });
      svc.findBySlug.mockResolvedValue(tenant("acme"));
      await run(mw, { hostname: "acme.sentry.scrolloop.com:3000" });
      expect(svc.findBySlug).toHaveBeenCalledWith("acme");
    });

    it.each([
      ["nested subdomain", "a.b.sentry.scrolloop.com"],
      ["reserved label", "api.sentry.scrolloop.com"],
      ["reserved label, any case", "ADMIN.sentry.scrolloop.com"],
      ["foreign host", "evil.com"],
      ["suffix lookalike", "acme.notsentry.scrolloop.com"],
      ["empty prefix", ".sentry.scrolloop.com"],
    ])("does not derive a slug for %s", async (_n, hostname) => {
      const { svc, mw } = build({ SENTRY_PLATFORM_DOMAIN: "sentry.scrolloop.com" });
      const { next } = await run(mw, { hostname });
      expect(svc.findBySlug).not.toHaveBeenCalled();
      expect(next.mock.calls[0]![0]).toBeInstanceOf(ApiException);
    });

    it("falls through from an unknown subdomain to the x-tenant-slug header", async () => {
      const { svc, mw } = build({ SENTRY_PLATFORM_DOMAIN: "sentry.scrolloop.com" });
      svc.findBySlug.mockImplementation(async (s: string) => (s === "beta" ? tenant("beta") : null));
      const { req } = await run(mw, {
        hostname: "ghost.sentry.scrolloop.com",
        headers: { "x-tenant-slug": "beta" },
      });
      expect(req.tenantId).toBe("id-beta");
    });

    it("uses x-tenant-id as id first, then slug", async () => {
      const { svc, mw } = build();
      svc.findById.mockResolvedValue(tenant("acme", "uuid-1"));
      const first = await run(mw, { hostname: "localhost", headers: { "x-tenant-id": "uuid-1" } });
      expect(first.req.tenantId).toBe("uuid-1");

      svc.findById.mockResolvedValue(null);
      svc.findBySlug.mockResolvedValue(tenant("acme"));
      const second = await run(mw, { hostname: "localhost", headers: { "x-tenant-id": "acme" } });
      expect(second.req.tenantId).toBe("id-acme");
    });

    it("ignores unresolvable x-tenant-slug and x-tenant-id", async () => {
      const { mw } = build();
      const { next } = await run(mw, {
        hostname: "localhost",
        headers: { "x-tenant-slug": "nope", "x-tenant-id": "nope" },
      });
      expect(next.mock.calls[0]![0]).toBeInstanceOf(ApiException);
    });
  });

  describe("dev hostname fallback (no platform domain)", () => {
    it.each(["localhost", "127.0.0.1", "10.0.0.5", "example.com", "www.example.com", "auth.example.com"])(
      "derives no slug for %s",
      async (hostname) => {
        const { svc, mw } = build();
        await run(mw, { hostname });
        expect(svc.findBySlug).not.toHaveBeenCalled();
      },
    );

    it("uses the first label of a 3+ label host", async () => {
      const { svc, mw } = build();
      svc.findBySlug.mockResolvedValue(tenant("acme"));
      const { req } = await run(mw, { hostname: "acme.example.com" });
      expect(svc.findBySlug).toHaveBeenCalledWith("acme");
      expect(req.tenantId).toBe("id-acme");
    });
  });

  describe("x-tenant-id header gating", () => {
    it("is rejected in production by default (spoofing guard)", async () => {
      const { svc, mw } = build({ NODE_ENV: "production" });
      const { next } = await run(mw, { hostname: "localhost", headers: { "x-tenant-id": "uuid-1" } });
      expect(svc.findById).not.toHaveBeenCalled();
      expect(next.mock.calls[0]![0]).toBeInstanceOf(ApiException);
    });

    it("is accepted in production only when ALLOW_TENANT_ID_HEADER=true", async () => {
      const { svc, mw } = build({ NODE_ENV: "production", ALLOW_TENANT_ID_HEADER: "true" });
      svc.findById.mockResolvedValue(tenant("acme", "uuid-1"));
      const { req } = await run(mw, { hostname: "localhost", headers: { "x-tenant-id": "uuid-1" } });
      expect(req.tenantId).toBe("uuid-1");
    });

    it("rejects truthy-but-not-'true' override values", async () => {
      const { svc, mw } = build({ NODE_ENV: "production", ALLOW_TENANT_ID_HEADER: "1" });
      await run(mw, { hostname: "localhost", headers: { "x-tenant-id": "uuid-1" } });
      expect(svc.findById).not.toHaveBeenCalled();
    });
  });

  describe("unresolved tenant", () => {
    it("returns TENANT_NOT_FOUND for protected paths", async () => {
      const { mw } = build();
      const { next } = await run(mw, { hostname: "localhost", path: "/api/users" });
      const err = next.mock.calls[0]![0] as ApiException;
      expect(err.code).toBe("TENANT_NOT_FOUND");
    });

    it.each(["/health", "/health/ready", "/metrics", "/.well-known/jwks.json", "/favicon.ico"])(
      "passes through public path %s without tenant",
      async (path) => {
        const { mw } = build();
        const { req, next } = await run(mw, { hostname: "localhost", path });
        expect(next).toHaveBeenCalledWith();
        expect(req.tenant).toBeUndefined();
      },
    );

    it.each(["/saml/metadata/acme", "/saml/sso/acme", "/saml/sso/continue/abc"])(
      "passes through public SAML path %s",
      async (path) => {
        const { mw } = build();
        const { next } = await run(mw, { hostname: "localhost", path });
        expect(next).toHaveBeenCalledWith();
      },
    );

    it.each(["/saml/sps", "/saml/sps/1", "/saml/metadata/a/b", "/saml/sso/a/b/c", "/saml/metadata/"])(
      "does not whitelist %s",
      async (path) => {
        const { mw } = build();
        const { next } = await run(mw, { hostname: "localhost", path });
        expect((next.mock.calls[0]![0] as ApiException).code).toBe("TENANT_NOT_FOUND");
      },
    );

    it("forwards service errors to next()", async () => {
      const { svc, mw } = build();
      const boom = new Error("db down");
      svc.findByCustomDomain.mockRejectedValue(boom);
      const { next } = await run(mw, { hostname: "x.example.com" });
      expect(next).toHaveBeenCalledWith(boom);
    });
  });
});
