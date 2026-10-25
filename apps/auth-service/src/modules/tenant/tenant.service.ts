// apps/auth-service/src/modules/tenant/tenant.service.ts
import { Injectable, Inject } from "@nestjs/common";
import { ApiException } from "../../common/http";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Tenant } from "@repo/database";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { type Cache } from "cache-manager";
import { TenantBrandingDto } from "./dto/tenant-branding.dto";
import { TenantSchemaService } from "@/core/tenant/tenant-schema.service";
import { logger } from "@/common/logger";

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,

    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    private tenantSchemaService: TenantSchemaService,
  ) {}

  /**
   * Find tenant by slug (subdomain)
   * Cached for 5 minutes
   */
  async findBySlug(slug: string): Promise<Tenant | null> {
    const cacheKey = `tenant:slug:${slug}`;

    // Check cache
    const cached = await this.cacheManager.get<Tenant>(cacheKey);
    if (cached) {
      return cached;
    }

    // Query database
    const tenant = await this.tenantRepository.findOne({
      where: { slug, active: true },
    });

    // Cache for 5 minutes
    if (tenant) {
      await this.cacheManager.set(cacheKey, tenant, 300000);
    }

    return tenant;
  }

  /**
   * Find tenant by custom domain
   * Cached for 5 minutes
   */
  async findByCustomDomain(domain: string): Promise<Tenant | null> {
    const cacheKey = `tenant:domain:${domain}`;

    // Check cache
    const cached = await this.cacheManager.get<Tenant>(cacheKey);
    if (cached) {
      return cached;
    }

    // Query database
    const tenant = await this.tenantRepository.findOne({
      where: {
        customDomain: domain,
        customDomainVerified: true,
        active: true,
      },
    });

    // Cache for 5 minutes
    if (tenant) {
      await this.cacheManager.set(cacheKey, tenant, 300000);
    }

    return tenant;
  }

  /**
   * Find tenant by ID
   * Cached for 10 minutes
   */
  async findById(id: string): Promise<Tenant | null> {
    const cacheKey = `tenant:id:${id}`;

    const cached = await this.cacheManager.get<Tenant>(cacheKey);
    if (cached) {
      return cached;
    }
    try {
      const tenant = await this.tenantRepository.findOne({
        where: { id, active: true },
      });

      if (tenant) {
        await this.cacheManager.set(cacheKey, tenant, 600000);
      }

      return tenant;
    } catch (e) {
      throw new ApiException("TENANT_NOT_FOUND");
    }
  }

  /**
   * Invalidate all caches for a tenant
   */
  async invalidateCache(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) return;

    await this.cacheManager.del(`tenant:id:${tenantId}`);
    await this.cacheManager.del(`tenant:slug:${tenant.slug}`);

    if (tenant.customDomain) {
      await this.cacheManager.del(`tenant:domain:${tenant.customDomain}`);
    }
  }

  /**
   * Create tenant (for platform admin)
   */
  async create(data: {
    slug: string;
    name: string;
    environment?: string;
  }): Promise<Tenant> {
    if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(data.slug.toLowerCase())) {
      throw new ApiException("VALIDATION_FAILED", {
        errors: [{ field: "slug", message: "Slug must match /^[a-z0-9][a-z0-9-]{2,62}$/" }],
      });
    }
    const tenant = this.tenantRepository.create({
      slug: data.slug.toLowerCase(),
      name: data.name,
      environment: data.environment || "production",
      active: true,
    });

    const saved = await this.tenantRepository.save(tenant);

    try {
      await this.tenantSchemaService.createSchema(saved.slug);
      logger.info({ tenantId: saved.id, slug: saved.slug }, "tenant_schema_created");
    } catch (schemaError) {
      // Compensating action: delete the tenant record so the slug is freed
      await this.tenantRepository.delete(saved.id).catch((delErr) => {
        logger.error({ delErr, tenantId: saved.id }, "Failed to rollback tenant after schema error");
      });
      logger.error(
        { err: schemaError instanceof Error ? schemaError.message : String(schemaError), tenantId: saved.id },
        "Schema creation failed — tenant rolled back",
      );
      throw new ApiException("INTERNAL_ERROR", { detail: 'Workspace provisioning failed. Please try again.' });
    }

    return saved;
  }

  /**
   * Set custom domain
   */
  async setCustomDomain(tenantId: string, domain: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new ApiException("TENANT_NOT_FOUND");
    }

    domain = domain.toLowerCase();
    const platformDomain = process.env["SENTRY_PLATFORM_DOMAIN"]?.toLowerCase();
    if (platformDomain && (domain === platformDomain || domain.endsWith(`.${platformDomain}`))) {
      throw new ApiException("VALIDATION_FAILED", {
        errors: [{ field: "domain", message: "Custom domain cannot be on the platform domain" }],
      });
    }
    tenant.customDomain = domain;
    tenant.customDomainVerified = false; // Require verification

    await this.tenantRepository.save(tenant);
    await this.invalidateCache(tenantId);

    return tenant;
  }

  /**
   * Verify custom domain
   */
  async verifyCustomDomain(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new ApiException("TENANT_NOT_FOUND");
    }

    tenant.customDomainVerified = true;

    await this.tenantRepository.save(tenant);
    await this.invalidateCache(tenantId);

    return tenant;
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({
      where: { id: tenantId },
    });
  }

  /**
   * Update tenant branding
   */
  async updateBranding(
    tenantId: string,
    branding: Partial<TenantBrandingDto>,
  ): Promise<Tenant> {
    const tenant = await this.getTenantById(tenantId);

    if (!tenant) {
      throw new ApiException('TENANT_NOT_FOUND');
    }

    // Merge with existing branding
    const updatedBranding = {
      ...tenant.branding,
      ...branding,
    };

    // Update tenant
    await this.tenantRepository.update(
      { id: tenantId },
      { branding: updatedBranding },
    );

    // Return updated tenant
    const updatedTenant = await this.getTenantById(tenantId);
    return updatedTenant!;
  }

  /**
   * Get tenant branding (public - no auth required)
   */
  async getBrandingBySlug(slug: string): Promise<TenantBrandingDto | null> {
    const tenant = await this.tenantRepository.findOne({
      where: { slug },
      select: ['branding'],
    });

    return tenant?.branding || null;
  }

  /**
   * Get tenant branding by domain (for custom domains)
   */
  async getBrandingByDomain(domain: string): Promise<TenantBrandingDto | null> {
    const tenant = await this.tenantRepository.findOne({
      where: { customDomain: domain },
      select: ['branding'],
    });

    return tenant?.branding || null;
  }
}
