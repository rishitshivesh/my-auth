import { Controller, Get, Patch, Param, Body, Request, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, MoreThan } from "typeorm";
import { User, Tenant, TenantSocialProvider, SecurityEventType } from "@repo/database";
import { ApiException } from "@/common/http";
import { SecurityEventService } from "@/common/service/security-event.service";
import { SessionRepository } from "@/core/database/session.repository";
import { type SocialProvider } from "@repo/database";
import { Protected } from "@/common/decorators/protected.decorator";
import { MfaService } from "@/modules/mfa/mfa.service";
import { DashboardService } from "./dashboard.service";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";
import { UpdateTenantSettingsDto } from "./dto/update-tenant-settings.dto";
import { TokenEncryptionService } from "@/modules/auth/oauth-token-encryption.service";
import { UpdateSocialProviderDto } from "./dto/update-social-provider.dto";

interface AuthenticatedRequest {
  tenantId: string;
  user: { sub: string; email?: string; mfaVerified?: boolean };
  ip?: string;
  requestId?: string;
  route?: { path: string };
  params?: Record<string, string>;
}

const SOCIAL_PROVIDERS = new Set<string>(["google", "github", "microsoft", "apple", "linkedin"]);

@ApiTags("Dashboard")
@Controller("dashboard")
@Protected()
export class DashboardController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly sessionRepository: SessionRepository,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantSocialProvider)
    private readonly tenantSocialProviderRepository: Repository<TenantSocialProvider>,
    private readonly mfaService: MfaService,
    private readonly dashboardService: DashboardService,
    private readonly securityEvents: SecurityEventService,
    private readonly tokenEncryption: TokenEncryptionService,
  ) {}

  private auditSettings(req: AuthenticatedRequest, metadata: Record<string, unknown>): void {
    this.securityEvents.log({
      tenantId: req.tenantId,
      userId: req.user.sub,
      actorEmail: req.user.email,
      eventType: SecurityEventType.TENANT_SETTINGS_UPDATED,
      severity: "info",
      ipAddress: req.ip ?? "0.0.0.0",
      userAgent: "dashboard",
      requestId: req.requestId,
      resourceType: "tenant_settings",
      resourceId: req.tenantId,
      metadata,
    });
  }

  @Get()
  @ApiOperation({ summary: "Get dashboard overview for current user" })
  async getOverview(@Request() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const [user, mfaStatus, activeSessions] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId, tenantId } }),
      this.mfaService.getMfaStatus(userId, tenantId),
      this.sessionRepository.count({
        where: { userId, tenantId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      }),
    ]);

    return {
      user: {
        id: user?.id,
        email: user?.email,
        firstName: user?.firstName,
        lastName: user?.lastName,
        displayName: user?.displayName,
        avatarUrl: user?.avatarUrl,
        emailVerified: user?.emailVerified,
        lastLoginAt: user?.lastLoginAt,
        createdAt: user?.createdAt,
        primaryAuthMethod: user?.primaryAuthMethod,
        status: user?.status,
      },
      mfa: mfaStatus,
      stats: {
        activeSessions,
        lastLoginAt: user?.lastLoginAt,
      },
    };
  }

  /** Empty/absent means "leave unchanged"; anything else is stored encrypted. */
  private encryptOptionalSecret(secret: string | undefined): string | undefined {
    return secret ? this.tokenEncryption.encryptSecret(secret) : undefined;
  }

  @Get("tenant-settings")
  @ApiOperation({ summary: "Get tenant login method settings" })
  async getTenantSettings(@Request() req: AuthenticatedRequest) {
    const tenantId = req.tenantId!;

    const [tenant, socialProviders] = await Promise.all([
      this.tenantRepository.findOne({ where: { id: tenantId } }),
      // client_secret is select:false; fetch it only to report presence, never to return it.
      this.tenantSocialProviderRepository
        .createQueryBuilder("sp")
        .addSelect("sp.clientSecret")
        .where("sp.tenantId = :tenantId", { tenantId })
        .getMany(),
    ]);

    return {
      featureFlags: tenant?.featureFlags || {},
      socialProviders: socialProviders.map((sp) => ({
        provider: sp.provider,
        enabled: sp.enabled,
        clientId: sp.clientId || null,
        hasClientSecret: !!sp.clientSecret,
      })),
    };
  }

  @Patch("tenant-settings")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_WRITE)
  @ApiOperation({ summary: "Update tenant feature flags for login methods" })
  async updateTenantSettings(
    @Request() req: AuthenticatedRequest,
    @Body() body: UpdateTenantSettingsDto,
  ) {
    const tenantId = req.tenantId!;
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) throw new ApiException("RESOURCE_NOT_FOUND");

    await this.tenantRepository.update(
      { id: tenantId },
      { featureFlags: { ...(tenant.featureFlags || {}), ...body.featureFlags } },
    );

    this.auditSettings(req, { flags: Object.keys(body.featureFlags) });
    return { message: "Settings updated" };
  }

  @Get("tenant-metrics")
  @ApiOperation({ summary: "Get aggregate metrics for this tenant" })
  async getTenantMetrics(@Request() req: AuthenticatedRequest) {
    return this.dashboardService.getTenantMetrics(req.tenantId!);
  }

  @Get("tenant-activity")
  @ApiOperation({ summary: "Get recent security events for this tenant" })
  async getTenantActivity(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limitStr?: string,
  ) {
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 20, 100) : 20;
    return this.dashboardService.getTenantActivity(req.tenantId!, limit);
  }

  @Get("api-call-trend")
  @ApiOperation({ summary: "Get daily API call counts for this tenant" })
  async getApiCallTrend(
    @Request() req: AuthenticatedRequest,
    @Query("days") daysStr?: string,
  ) {
    const raw = parseInt(daysStr ?? "7", 10);
    const days = ([7, 14, 30].includes(raw) ? raw : 7) as 7 | 14 | 30;
    return this.dashboardService.getApiCallTrend(req.tenantId!, days);
  }

  @Get("auth-breakdown")
  @ApiOperation({ summary: "Get authentication method breakdown for this tenant" })
  async getAuthBreakdown(@Request() req: AuthenticatedRequest) {
    return this.dashboardService.getAuthMethodBreakdown(req.tenantId!);
  }

  @Patch("tenant-settings/social/:provider")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.TENANT_WRITE)
  @ApiOperation({ summary: "Enable/disable and configure a social provider for this tenant" })
  async updateSocialProvider(
    @Request() req: AuthenticatedRequest,
    @Param("provider") provider: string,
    @Body() body: UpdateSocialProviderDto,
  ) {
    const tenantId = req.tenantId!;
    if (!SOCIAL_PROVIDERS.has(provider)) {
      throw new ApiException("BAD_REQUEST", { detail: `Unsupported social provider "${provider}"` });
    }

    const existing = await this.tenantSocialProviderRepository.findOne({
      where: { tenantId, provider: provider as SocialProvider },
    });

    if (existing) {
      await this.tenantSocialProviderRepository.update(existing.id, {
        enabled: body.enabled,
        ...(body.clientId !== undefined && { clientId: body.clientId }),
        ...(body.clientSecret !== undefined && { clientSecret: this.encryptOptionalSecret(body.clientSecret) }),
      });
    } else {
      await this.tenantSocialProviderRepository.save({
        tenantId,
        provider: provider as SocialProvider,
        enabled: body.enabled,
        clientId: body.clientId,
        clientSecret: this.encryptOptionalSecret(body.clientSecret),
        useSharedApp: !body.clientId,
      });
    }

    this.auditSettings(req, { provider, enabled: body.enabled, credentialsChanged: body.clientId !== undefined || body.clientSecret !== undefined });
    return { message: "Social provider updated" };
  }
}
