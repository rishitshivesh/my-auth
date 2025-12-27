// apps/auth-service/src/common/middleware/tenant-resolver.middleware.ts
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

  constructor(private tenantService: TenantService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await this.resolveTenant(req);

      if (!tenant) {
        // Public endpoints (health, metrics) can proceed
        if (this.isPublicEndpoint(req.path)) {
          return next();
        }

        throw new NotFoundException(
          "Tenant not found. Please check your domain or tenant ID.",
        );
      }

      // Attach tenant to request
      req.tenant = tenant;
      req.tenantId = tenant.id;

      // Log for debugging (remove in production)
      this.logger.debug(
        `Resolved tenant: ${tenant.slug} (${tenant.id}) from ${req.hostname}`,
      );

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resolve tenant from request
   * Priority:
   * 1. Custom domain (auth.acme.com)
   * 2. Subdomain (acme.fortknox.io)
   * 3. X-Tenant-ID header (fallback)
   */
  private async resolveTenant(req: Request): Promise<Tenant | null> {
    const hostname = req.hostname;

    // Strategy 1: Custom domain lookup
    // auth.acme.com → check if any tenant has this custom domain
    const customDomainTenant =
      await this.tenantService.findByCustomDomain(hostname);

    if (customDomainTenant) {
      return customDomainTenant;
    }

    // Strategy 2: Subdomain extraction
    // acme.fortknox.io → extract "acme"
    const subdomain = this.extractSubdomain(hostname);

    if (subdomain && subdomain !== "www" && subdomain !== "api") {
      const subdomainTenant = await this.tenantService.findBySlug(subdomain);

      if (subdomainTenant) {
        return subdomainTenant;
      }
    }

    // Strategy 3: X-Tenant-ID header (for development/testing)
    const tenantIdHeader = req.headers["x-tenant-id"] as string;

    if (tenantIdHeader) {
      // Try as ID first
      let tenant = await this.tenantService.findById(tenantIdHeader);

      // Try as slug if ID lookup fails
      if (!tenant) {
        tenant = await this.tenantService.findBySlug(tenantIdHeader);
      }

      if (tenant) {
        return tenant;
      }
    }

    return null;
  }

  /**
   * Extract subdomain from hostname
   * Examples:
   * - acme.fortknox.io → "acme"
   * - auth.acme.com → "auth"
   * - localhost:4000 → null
   */
  private extractSubdomain(hostname: string): string | null {
    // Remove port if present
    const host: string = hostname.split(":")[0] as string;

    // Localhost or IP address
    if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return null;
    }

    const parts = host.split(".");

    // Need at least 3 parts for subdomain (sub.domain.tld)
    if (parts.length < 3) {
      return null;
    }

    // Return first part as subdomain
    return parts[0] as string;
  }

  /**
   * Check if endpoint is public (doesn't require tenant)
   */
  private isPublicEndpoint(path: string): boolean {
    const publicPaths = ["/health", "/metrics", "/.well-known", "/favicon.ico"];

    return publicPaths.some((publicPath) => path.startsWith(publicPath));
  }
}
