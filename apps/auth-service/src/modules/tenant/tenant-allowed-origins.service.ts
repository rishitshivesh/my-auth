import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Tenant } from "@repo/database";
import { ApiException } from "@/common/http";
import { normalizeOrigins } from "@/common/security/cors-origin";
import { CorsRefreshService } from "@/core/cors-refresh.service";
import { TenantService } from "./tenant.service";
import type { TenantAllowedOriginsResponse } from "./dto/tenant-allowed-origins.dto";

/** Reads and replaces the per-tenant CORS allow-list stored on `public.tenants.allowed_origins`. */
@Injectable()
export class TenantAllowedOriginsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly tenantService: TenantService,
    private readonly cors: CorsRefreshService,
  ) {}

  async get(tenantId: string): Promise<TenantAllowedOriginsResponse> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new ApiException("TENANT_NOT_FOUND");
    return { origins: tenant.allowedOrigins ?? [] };
  }

  async replace(tenantId: string, input: readonly string[]): Promise<TenantAllowedOriginsResponse> {
    const { origins, errors } = normalizeOrigins(input);
    if (errors.length > 0) {
      throw new ApiException("VALIDATION_FAILED", {
        errors: errors.map((e) => ({ field: "origins", message: `${e.value}: ${e.message}` })),
      });
    }
    const result = await this.tenants.update({ id: tenantId }, { allowedOrigins: origins });
    if (!result.affected) throw new ApiException("TENANT_NOT_FOUND");
    await this.tenantService.invalidateCache(tenantId);
    await this.cors.refreshTenant(tenantId);
    return { origins };
  }
}
