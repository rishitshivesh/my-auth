// apps/auth-service/src/common/middleware/tenant-resolver.middleware.ts
import { ApiException } from "@/common/http";
import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { TenantService } from "../../modules/tenant/tenant.service";
import { Tenant } from "@repo/database";

// Extend Express Request to include tenant
declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      tenantId?: string;
    }
  }
}

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);

  /**
   * The platform's base domain (e.g. "sentry.scrolloop.com").
   * Tenant subdomains are prefixed to this: acme.sentry.scrolloop.com.
   * Null in local dev (no subdomain routing on localhost).
   */
  private readonly platformDomain: string | null =
    process.env["SENTRY_PLATFORM_DOMAIN"] ?? null;

  /**
   * Whether to accept X-Tenant-ID header for tenant resolution.
   * Always true in dev. In production, requires ALLOW_TENANT_ID_HEADER=true.
   * Prevents header-spoofing attacks on production deployments.
   */
  private readonly allowTenantIdHeader: boolean =
    process.env["NODE_ENV"] !== "production" ||
    process.env["ALLOW_TENANT_ID_HEADER"] === "true";

  constructor(private tenantService: TenantService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    try {
      const tenant = await this.resolveTenant(req);

      if (!tenant) {
        if (this.isPublicEndpoint(req.path)) {
          return next();
        }

        throw new ApiException("TENANT_NOT_FOUND", {
          detail: "Tenant not found. Please check your domain or tenant ID.",
        });
      }

      req.tenant = tenant;
      req.tenantId = tenant.id;

      this.logger.debug(
        `Resolved tenant: ${tenant.slug} (${tenant.id}) from ${req.hostname}`,
      );

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resolve tenant from request.
   *
   * Priority:
   *   1. Custom domain  (auth.acme.com → tenant with that custom_domain)
   *   2. Subdomain      (acme.sentry.scrolloop.com → slug "acme")
   *   3. X-Tenant-ID header  (dev only, or ALLOW_TENANT_ID_HEADER=true)
   */
  private async resolveTenant(req: Request): Promise<Tenant | null> {
    const hostname = req.hostname;

    // ── 1. Custom domain ────────────────────────────────────────────────────
    const customDomainTenant =
      await this.tenantService.findByCustomDomain(hostname);
    if (customDomainTenant) return customDomainTenant;

    // ── 2. Subdomain ─────────────────────────────────────────────────────────
    const slug = this.extractTenantSlug(hostname);
    if (slug) {
      const subdomainTenant = await this.tenantService.findBySlug(slug);
      if (subdomainTenant) return subdomainTenant;
    }

    // ── 3. X-Tenant-Slug header (always accepted — slug is not a secret) ────────
    const slugHeader = req.headers["x-tenant-slug"] as string | undefined;
    if (slugHeader) {
      const tenant = await this.tenantService.findBySlug(slugHeader);
      if (tenant) return tenant;
    }

    // ── 4. X-Tenant-ID header (dev / explicitly enabled) ─────────────────────
    if (this.allowTenantIdHeader) {
      const tenantIdHeader = req.headers["x-tenant-id"] as string | undefined;
      if (tenantIdHeader) {
        // Accept UUID or slug
        const tenant =
          (await this.tenantService.findById(tenantIdHeader)) ??
          (await this.tenantService.findBySlug(tenantIdHeader));
        if (tenant) return tenant;
      }
    }

    return null;
  }

  /**
   * Extract the tenant slug from a hostname.
   *
   * When SENTRY_PLATFORM_DOMAIN is set (production):
   *   acme.sentry.scrolloop.com  →  "acme"
   *   sentry.scrolloop.com       →  "sentry"  (platform = sentry tenant)
   *   api.sentry.scrolloop.com   →  null      (reserved label, not a tenant)
   *   unrelated.com              →  null
   *
   * Without SENTRY_PLATFORM_DOMAIN (local dev):
   *   Falls back to splitting on "." and using the first label.
   *   localhost → null (no routing on localhost).
   */
  private extractTenantSlug(hostname: string): string | null {
    const host = hostname.split(":")[0] as string; // strip port

    if (this.platformDomain) {
      // Exact match: request IS the platform domain → sentry tenant
      if (host === this.platformDomain) {
        return "sentry";
      }

      // Subdomain of platform: {slug}.{platformDomain}
      const suffix = `.${this.platformDomain}`;
      if (host.endsWith(suffix)) {
        const prefix = host.slice(0, host.length - suffix.length);
        // Only accept single-label prefixes (no nested subdomains like a.b.platform.com)
        if (prefix && !prefix.includes(".") && !this.isReservedLabel(prefix)) {
          return prefix;
        }
      }

      // Host doesn't belong to the platform domain — custom-domain flow handles it
      return null;
    }

    // ── Local dev fallback (no SENTRY_PLATFORM_DOMAIN) ─────────────────────
    if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      return null;
    }

    const parts = host.split(".");
    if (parts.length < 3) return null;

    const first = parts[0] as string;
    return this.isReservedLabel(first) ? null : first;
  }

  /** Labels that are infrastructure identifiers, not tenant slugs. */
  private isReservedLabel(label: string): boolean {
    const reserved = new Set([
      "www", "api", "admin", "mail", "smtp", "ftp",
      "cdn", "static", "assets", "media", "auth",
      "status", "docs", "help", "support",
    ]);
    return reserved.has(label.toLowerCase());
  }

  /**
   * Unauthenticated SAML endpoints reached by third-party SPs at a shared
   * platform hostname — the tenant is disambiguated by the :tenantSlug path
   * segment, not by subdomain/header, so host-based resolution legitimately
   * finds nothing here. The SAML module resolves and schema-scopes the
   * tenant itself. Matched precisely (not a bare "/saml" prefix) so the
   * authenticated /saml/sps* SP-management routes keep normal tenant
   * resolution and still get `req.tenantId` set.
   */
  private readonly publicSamlRoutes = [
    /^\/saml\/metadata\/[^/]+$/,
    /^\/saml\/sso\/continue\/[^/]+$/,
    /^\/saml\/sso\/[^/]+$/,
  ];

  private isPublicEndpoint(path: string): boolean {
    const publicPaths = ["/health", "/metrics", "/.well-known", "/favicon.ico"];
    return (
      publicPaths.some((p) => path.startsWith(p)) ||
      this.publicSamlRoutes.some((r) => r.test(path))
    );
  }
}
