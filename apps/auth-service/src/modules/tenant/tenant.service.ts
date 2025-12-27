// apps/auth-service/src/modules/tenant/tenant.service.ts
import { Injectable, NotFoundException, Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Tenant } from "@repo/database";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { type Cache } from "cache-manager";

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,

    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
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

    const tenant = await this.tenantRepository.findOne({
      where: { id, active: true },
    });

    if (tenant) {
      await this.cacheManager.set(cacheKey, tenant, 600000);
    }

    return tenant;
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
    const tenant = this.tenantRepository.create({
      slug: data.slug.toLowerCase(),
      name: data.name,
      environment: data.environment || "production",
      active: true,
    });

    return this.tenantRepository.save(tenant);
  }

  /**
   * Set custom domain
   */
  async setCustomDomain(tenantId: string, domain: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
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
      throw new NotFoundException("Tenant not found");
    }

    tenant.customDomainVerified = true;

    await this.tenantRepository.save(tenant);
    await this.invalidateCache(tenantId);

    return tenant;
  }
}
