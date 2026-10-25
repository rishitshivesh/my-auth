import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SecurityEventType } from "@repo/database";
import { Protected } from "@/common/decorators/protected.decorator";
import { SecurityEventService } from "@/common/service/security-event.service";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";
import { TenantAllowedOriginsService } from "./tenant-allowed-origins.service";
import { UpdateTenantAllowedOriginsDto, type TenantAllowedOriginsResponse } from "./dto/tenant-allowed-origins.dto";

interface AuthenticatedRequest {
  tenantId: string;
  requestId?: string;
  user: { sub: string; email?: string };
  ip?: string;
  headers?: Record<string, string>;
}

/**
 * GET /tenants/current/allowed-origins  - this tenant's browser (CORS) origins
 * PUT /tenants/current/allowed-origins  - replace the list; validated, canonicalised, audited
 */
@ApiTags("Tenant allowed origins")
@Controller("tenants/current/allowed-origins")
@Protected()
export class TenantAllowedOriginsController {
  constructor(
    private readonly origins: TenantAllowedOriginsService,
    private readonly securityEvents: SecurityEventService,
  ) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_READ)
  @ApiOperation({ summary: "List the origins allowed to call the API from a browser for this tenant" })
  get(@Req() req: AuthenticatedRequest): Promise<TenantAllowedOriginsResponse> {
    return this.origins.get(req.tenantId);
  }

  @Put()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_WRITE)
  @ApiOperation({ summary: "Replace this tenant's allowed CORS origins" })
  async replace(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateTenantAllowedOriginsDto,
  ): Promise<TenantAllowedOriginsResponse> {
    const before = (await this.origins.get(req.tenantId)).origins;
    const updated = await this.origins.replace(req.tenantId, dto.origins);
    this.securityEvents.log({
      tenantId: req.tenantId,
      userId: req.user.sub,
      actorEmail: req.user.email,
      eventType: SecurityEventType.TENANT_SETTINGS_UPDATED,
      severity: "info",
      ipAddress: req.ip ?? "0.0.0.0",
      userAgent: req.headers?.["user-agent"] ?? "unknown",
      requestId: req.requestId,
      resourceType: "allowed_origins",
      resourceId: req.tenantId,
      metadata: {
        added: updated.origins.filter((o) => !before.includes(o)),
        removed: before.filter((o) => !updated.origins.includes(o)),
      },
    });
    return updated;
  }
}
