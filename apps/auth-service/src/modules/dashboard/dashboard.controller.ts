import { Controller, Get, Patch, Param, Body, Request } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { User, Session, Tenant, TenantSocialProvider } from "@repo/database";
import { Protected } from "@/common/decorators/protected.decorator";
import { MfaService } from "@/modules/mfa/mfa.service";

@ApiTags("Dashboard")
@Controller("dashboard")
@Protected()
export class DashboardController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantSocialProvider)
    private readonly tenantSocialProviderRepository: Repository<TenantSocialProvider>,
    private readonly mfaService: MfaService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get dashboard overview for current user" })
  async getOverview(@Request() req: any) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const [user, mfaStatus, activeSessions] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId, tenantId } }),
      this.mfaService.getMfaStatus(userId, tenantId),
      this.sessionRepository.count({
        where: { userId, tenantId, revokedAt: IsNull() },
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

  @Get("tenant-settings")
  @ApiOperation({ summary: "Get tenant login method settings" })
  async getTenantSettings(@Request() req: any) {
    const tenantId = req.tenantId!;

    const [tenant, socialProviders] = await Promise.all([
      this.tenantRepository.findOne({ where: { id: tenantId } }),
      this.tenantSocialProviderRepository.find({ where: { tenantId } }),
    ]);

    return {
      featureFlags: tenant?.featureFlags || {},
      socialProviders: socialProviders.map((sp) => ({
        provider: sp.provider,
        enabled: sp.enabled,
        clientId: sp.clientId || null,
        hasSecret: !!sp.clientSecret,
      })),
    };
  }

  @Patch("tenant-settings")
  @ApiOperation({ summary: "Update tenant feature flags for login methods" })
  async updateTenantSettings(
    @Request() req: any,
    @Body() body: { featureFlags: Record<string, boolean> },
  ) {
    const tenantId = req.tenantId!;
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) throw new Error("Tenant not found");

    await this.tenantRepository.update(
      { id: tenantId },
      { featureFlags: { ...(tenant.featureFlags || {}), ...body.featureFlags } },
    );

    return { message: "Settings updated" };
  }

  @Patch("tenant-settings/social/:provider")
  @ApiOperation({ summary: "Enable/disable and configure a social provider for this tenant" })
  async updateSocialProvider(
    @Request() req: any,
    @Param("provider") provider: string,
    @Body() body: { enabled: boolean; clientId?: string; clientSecret?: string },
  ) {
    const tenantId = req.tenantId!;

    const existing = await this.tenantSocialProviderRepository.findOne({
      where: { tenantId, provider: provider as any },
    });

    if (existing) {
      await this.tenantSocialProviderRepository.update(existing.id, {
        enabled: body.enabled,
        ...(body.clientId !== undefined && { clientId: body.clientId }),
        ...(body.clientSecret !== undefined && { clientSecret: body.clientSecret }),
      });
    } else {
      await this.tenantSocialProviderRepository.save({
        tenantId,
        provider: provider as any,
        enabled: body.enabled,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        useSharedApp: !body.clientId,
      });
    }

    return { message: "Social provider updated" };
  }
}
