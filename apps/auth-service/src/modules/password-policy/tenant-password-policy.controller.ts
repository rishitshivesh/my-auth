import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SecurityEventType } from "@repo/database";
import { Protected } from "@/common/decorators/protected.decorator";
import { SecurityEventService } from "@/common/service/security-event.service";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";
import { TenantPasswordPolicyService, type EffectivePasswordPolicy } from "./tenant-password-policy.service";
import { UpdatePasswordPolicyDto } from "./dto/update-password-policy.dto";

interface AuthenticatedRequest {
  tenantId: string;
  requestId?: string;
  user: { sub: string; email?: string };
  ip?: string;
  headers?: Record<string, string>;
}

/**
 * GET /tenants/current/password-policy  - effective policy (platform defaults when unset)
 * PUT /tenants/current/password-policy  - set fields; tenants can only be stricter than the platform minimum
 */
@ApiTags("Tenant password policy")
@Controller("tenants/current/password-policy")
@Protected()
export class TenantPasswordPolicyController {
  constructor(
    private readonly policy: TenantPasswordPolicyService,
    private readonly securityEvents: SecurityEventService,
  ) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_READ)
  @ApiOperation({ summary: "Get the tenant password and lockout policy" })
  get(@Req() req: AuthenticatedRequest): Promise<EffectivePasswordPolicy> {
    return this.policy.get(req.tenantId);
  }

  @Put()
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_WRITE)
  @ApiOperation({ summary: "Update the tenant password and lockout policy" })
  async update(@Req() req: AuthenticatedRequest, @Body() dto: UpdatePasswordPolicyDto): Promise<EffectivePasswordPolicy> {
    const updated = await this.policy.update(req.tenantId, dto);
    this.securityEvents.log({
      tenantId: req.tenantId,
      userId: req.user.sub,
      actorEmail: req.user.email,
      eventType: SecurityEventType.TENANT_SETTINGS_UPDATED,
      severity: "info",
      ipAddress: req.ip ?? "0.0.0.0",
      userAgent: req.headers?.["user-agent"] ?? "unknown",
      requestId: req.requestId,
      resourceType: "password_policy",
      resourceId: req.tenantId,
      metadata: { ...updated },
    });
    return updated;
  }
}
