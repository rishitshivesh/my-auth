import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, MoreThan } from "typeorm";
import {
  User,
  Session,
  Tenant,
  SecurityEvent,
  Role,
  UserRole,
} from "@repo/database";
import { RedisService } from "@/common/service/redis.service";
import { SessionService } from "@/common/service/session.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { JwtService } from "@nestjs/jwt";
import { PasswordService } from "@repo/security";
import { randomBytes, timingSafeEqual } from "crypto";
import { logger } from "@/common/logger";

export interface PlatformMetricsDto {
  totalTenants: number;
  totalUsers: number;
  activeSessions: number;
  apiCallsToday: number;
}

export interface TenantListItemDto {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  userCount: number;
  createdAt: Date;
  environment: string;
  customDomain?: string;
}

export interface RecentActivityItem {
  id: string;
  eventType: string;
  actorEmail?: string;
  severity: string;
  createdAt: Date;
  ipAddress?: string;
}

export interface TenantDetailDto extends TenantListItemDto {
  featureFlags: Record<string, boolean>;
  settings: Record<string, unknown>;
  activeSessions: number;
  recentActivity: RecentActivityItem[];
}

export interface TeamMemberDto {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  addedAt?: Date;
}

export interface CreateFirstAdminDto {
  name: string;
  email: string;
  password: string;
}

export interface FirstAdminResultDto {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
}

export interface PlatformSettingsDto {
  platformName: string;
  smtpConfigured: boolean;
  smtpHost?: string;
  supportEmail?: string;
  allowPublicSignup: boolean;
  maintenanceMode: boolean;
}

const SENTRY_TENANT_SLUG = "sentry";
const SENTRY_INTERNAL_ROLE = "sentry-internal";

@Injectable()
export class AdminService implements OnModuleInit {
  private setupToken: string | null = null;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    private readonly redisService: RedisService,
    private readonly sessionService: SessionService,
    private readonly jwksService: JwksService,
    private readonly oauthRefreshTokenService: OAuthRefreshTokenService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initSetupToken();
  }

  async initSetupToken(): Promise<void> {
    const initialized = await this.isInitialized();
    if (!initialized) {
      this.setupToken = randomBytes(32).toString("hex");
      logger.info(`=== FIRST RUN SETUP TOKEN: ${this.setupToken} ===`);
      logger.info(
        "Use this token in the X-Setup-Token header when calling POST /superadmin/create-first-admin",
      );
    }
  }

  private validateSetupToken(token: string): boolean {
    if (!this.setupToken) return false;
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(this.setupToken);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  invalidateSetupToken(): void {
    this.setupToken = null;
  }

  private async getSentryTenant(): Promise<Tenant | null> {
    return this.tenantRepository.findOne({
      where: { slug: SENTRY_TENANT_SLUG },
    });
  }

  private async getSentryInternalRole(
    tenantId: string,
  ): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { name: SENTRY_INTERNAL_ROLE, tenantId },
    });
  }

  async getPlatformMetrics(): Promise<PlatformMetricsDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalTenants, totalUsers, activeSessions] = await Promise.all([
      this.tenantRepository.count(),
      this.userRepository.count(),
      this.sessionRepository.count({
        where: {
          revokedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
      }),
    ]);

    // Sum API calls across all tenants from Redis
    const allTenants = await this.tenantRepository.find({ select: ["id"] });
    const todayStr = new Date().toISOString().split("T")[0] as string;
    let apiCallsToday = 0;
    for (const t of allTenants) {
      const counts = await this.redisService
        .getDailyApiCallCounts(t.id, [todayStr])
        .catch(() => [0]);
      apiCallsToday += counts[0] ?? 0;
    }

    return { totalTenants, totalUsers, activeSessions, apiCallsToday };
  }

  async listTenants(params: {
    search?: string;
    status?: string;
    plan?: string;
    page?: number;
    limit?: number;
  }): Promise<{ tenants: TenantListItemDto[]; total: number }> {
    const { search, status, plan, page = 1, limit = 20 } = params;

    const qb = this.tenantRepository.createQueryBuilder("t");

    if (search) {
      qb.andWhere("(t.name ILIKE :search OR t.slug ILIKE :search)", {
        search: `%${search}%`,
      });
    }
    if (status) {
      qb.andWhere("t.active = :active", { active: status === "active" });
    }
    if (plan) {
      qb.andWhere("t.plan = :plan", { plan });
    }

    qb.orderBy("t.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [tenants, total] = await qb.getManyAndCount();

    // Get user counts per tenant
    const tenantIds = tenants.map((t) => t.id);
    const userCounts: Record<string, number> = {};
    if (tenantIds.length > 0) {
      const rows = await this.userRepository
        .createQueryBuilder("u")
        .select("u.tenantId", "tenantId")
        .addSelect("COUNT(u.id)", "count")
        .where("u.tenantId IN (:...ids)", { ids: tenantIds })
        .groupBy("u.tenantId")
        .getRawMany<{ tenantId: string; count: string }>();
      for (const r of rows) {
        userCounts[r.tenantId] = parseInt(r.count, 10);
      }
    }

    return {
      total,
      tenants: tenants.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        plan: (t as unknown as Record<string, unknown>).plan as string ?? "free",
        status: t.active ? "active" : "suspended",
        userCount: userCounts[t.id] ?? 0,
        createdAt: t.createdAt,
        environment: t.environment,
        customDomain: t.customDomain,
      })),
    };
  }

  async getTenantById(id: string): Promise<TenantDetailDto> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException("Tenant not found");

    const [userCount, activeSessions, recentActivity] = await Promise.all([
      this.userRepository.count({ where: { tenantId: id } }),
      this.sessionRepository.count({
        where: {
          tenantId: id,
          revokedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
      }),
      this.securityEventRepository.find({
        where: { tenantId: id },
        order: { createdAt: "DESC" },
        take: 5,
      }),
    ]);

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      plan: (tenant as unknown as Record<string, unknown>).plan as string ?? "free",
      status: tenant.active ? "active" : "suspended",
      userCount,
      createdAt: tenant.createdAt,
      environment: tenant.environment,
      customDomain: tenant.customDomain,
      featureFlags: tenant.featureFlags ?? {},
      settings: (tenant as unknown as Record<string, unknown>).settings as Record<string, unknown> ?? {},
      activeSessions,
      recentActivity: recentActivity.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        actorEmail: e.actorEmail,
        severity: e.severity,
        createdAt: e.createdAt,
        ipAddress: e.ipAddress,
      })),
    };
  }

  async createTenant(dto: {
    name: string;
    slug: string;
    plan?: string;
    ownerEmail?: string;
    environment?: string;
  }): Promise<TenantDetailDto> {
    const existing = await this.tenantRepository.findOne({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException("Slug is already taken");

    const tenant = this.tenantRepository.create({
      name: dto.name,
      slug: dto.slug,
      environment: dto.environment ?? "production",
      active: true,
      featureFlags: {
        mfaRequired: false,
        passwordlessEnabled: true,
        socialProvidersEnabled: true,
      },
    } as Partial<Tenant>);
    if (dto.plan) (tenant as unknown as Record<string, unknown>).plan = dto.plan;

    const saved = await this.tenantRepository.save(tenant);
    return this.getTenantById(saved.id);
  }

  async updateTenant(
    id: string,
    dto: { status?: string; name?: string; plan?: string },
  ): Promise<TenantDetailDto> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException("Tenant not found");

    const updates: Partial<Tenant> = {};
    if (dto.name) updates.name = dto.name;
    if (dto.status) updates.active = dto.status === "active";
    if (dto.plan) (updates as unknown as Record<string, unknown>).plan = dto.plan;

    await this.tenantRepository.update({ id }, updates);
    return this.getTenantById(id);
  }

  async deleteTenant(id: string): Promise<void> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    await this.tenantRepository.delete({ id });
  }

  async checkSlugAvailability(
    slug: string,
  ): Promise<{ available: boolean; reason?: string }> {
    const RESERVED = [
      "admin",
      "api",
      "auth",
      "www",
      "mail",
      "smtp",
      "sentry",
      "support",
      "help",
      "status",
      "billing",
      "dashboard",
      "login",
      "logout",
      "signup",
      "register",
    ];

    if (slug.length < 4)
      return { available: false, reason: "Slug must be at least 4 characters" };
    if (slug.length > 63)
      return { available: false, reason: "Slug must be 63 characters or less" };
    if (!/^[a-z0-9-]+$/.test(slug))
      return {
        available: false,
        reason: "Only lowercase letters, numbers, and hyphens allowed",
      };
    if (slug.startsWith("-") || slug.endsWith("-"))
      return {
        available: false,
        reason: "Slug cannot start or end with a hyphen",
      };
    if (RESERVED.includes(slug))
      return { available: false, reason: "This slug is reserved" };

    // Check Redis reservation
    const reservationKey = `common:slug:reservation:${slug}`;
    const reserved = await this.redisService
      .get("", "", reservationKey)
      .catch(() => null);
    if (reserved)
      return {
        available: false,
        reason: "This slug is being claimed by another user",
      };

    // Check database
    const existing = await this.tenantRepository.findOne({ where: { slug } });
    if (existing)
      return { available: false, reason: "This slug is already taken" };

    // Reserve for 5 minutes
    await this.redisService
      .set("", "", reservationKey, "pending", 300)
      .catch(() => {});

    return { available: true };
  }

  async getRecentActivity(limit = 20): Promise<RecentActivityItem[]> {
    const events = await this.securityEventRepository.find({
      order: { createdAt: "DESC" },
      take: limit,
    });
    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      actorEmail: e.actorEmail,
      severity: e.severity,
      createdAt: e.createdAt,
      ipAddress: e.ipAddress,
      tenantId: e.tenantId,
    }));
  }

  // ─── Team Management ────────────────────────────────────────────

  async getTeamMembers(): Promise<TeamMemberDto[]> {
    const sentryTenant = await this.getSentryTenant();
    if (!sentryTenant) return [];

    const role = await this.getSentryInternalRole(sentryTenant.id);
    if (!role) return [];

    const userRoles = await this.userRoleRepository.find({
      where: { roleId: role.id, tenantId: sentryTenant.id },
      relations: ["user"],
    });

    return userRoles.map((ur) => ({
      id: ur.user.id,
      email: ur.user.email,
      firstName: ur.user.firstName,
      lastName: ur.user.lastName,
      addedAt: ur.assignedAt,
    }));
  }

  async addTeamMember(email: string): Promise<TeamMemberDto> {
    const sentryTenant = await this.getSentryTenant();
    if (!sentryTenant) throw new NotFoundException("Scrolloop Sentry tenant not found");

    const user = await this.userRepository.findOne({
      where: { email, tenantId: sentryTenant.id },
    });
    if (!user) {
      throw new NotFoundException(
        `No user with email "${email}" found in the sentry tenant`,
      );
    }

    let role = await this.getSentryInternalRole(sentryTenant.id);
    if (!role) {
      role = this.roleRepository.create({
        name: SENTRY_INTERNAL_ROLE,
        description: "Scrolloop Sentry platform superadmin",
        tenantId: sentryTenant.id,
        isSystem: true,
      } as Partial<Role>);
      role = await this.roleRepository.save(role);
    }

    const existing = await this.userRoleRepository.findOne({
      where: { userId: user.id, roleId: role?.id, tenantId: sentryTenant.id },
    });
    if (existing) {
      throw new ConflictException(`${email} is already a team member`);
    }

    const userRole = this.userRoleRepository.create({
      userId: user.id,
      roleId: role?.id,
      tenantId: sentryTenant.id,
    });
    await this.userRoleRepository.save(userRole);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      addedAt: userRole.assignedAt,
    };
  }

  async removeTeamMember(userId: string): Promise<void> {
    const sentryTenant = await this.getSentryTenant();
    if (!sentryTenant) throw new NotFoundException("Scrolloop Sentry tenant not found");

    const role = await this.getSentryInternalRole(sentryTenant.id);
    if (!role) throw new NotFoundException("Role not found");

    const userRole = await this.userRoleRepository.findOne({
      where: { userId, roleId: role.id, tenantId: sentryTenant.id },
    });
    if (!userRole) throw new NotFoundException("Team member not found");

    await this.userRoleRepository.delete({ id: userRole.id });
  }

  // ─── Platform Settings ───────────────────────────────────────────

  async getPlatformSettings(): Promise<PlatformSettingsDto> {
    const sentryTenant = await this.getSentryTenant();
    const stored = (sentryTenant as unknown as Record<string, unknown>)?.settings as Record<string, unknown> ?? {};

    return {
      platformName: (stored.platformName as string | undefined) ?? "Scrolloop Sentry",
      smtpConfigured: !!(process.env.SMTP_HOST || stored.smtpHost),
      smtpHost: (stored.smtpHost as string | undefined) ?? process.env.SMTP_HOST ?? undefined,
      supportEmail:
        (stored.supportEmail as string | undefined) ?? process.env.SUPPORT_EMAIL ?? undefined,
      allowPublicSignup: (stored.allowPublicSignup as boolean | undefined) ?? false,
      maintenanceMode: (stored.maintenanceMode as boolean | undefined) ?? false,
    };
  }

  async updatePlatformSettings(
    dto: Partial<PlatformSettingsDto>,
  ): Promise<PlatformSettingsDto> {
    const sentryTenant = await this.getSentryTenant();
    if (!sentryTenant) throw new NotFoundException("Scrolloop Sentry tenant not found");

    const current = (sentryTenant as unknown as Record<string, unknown>).settings as Record<string, unknown> ?? {};
    const updated = { ...current };

    if (dto.platformName !== undefined) updated.platformName = dto.platformName;
    if (dto.smtpHost !== undefined) updated.smtpHost = dto.smtpHost;
    if (dto.supportEmail !== undefined) updated.supportEmail = dto.supportEmail;
    if (dto.allowPublicSignup !== undefined)
      updated.allowPublicSignup = dto.allowPublicSignup;
    if (dto.maintenanceMode !== undefined)
      updated.maintenanceMode = dto.maintenanceMode;

    await this.tenantRepository.update({ id: sentryTenant.id }, {
      settings: updated,
    } as Partial<Tenant>);
    return this.getPlatformSettings();
  }

  // ─── First-Run Setup ─────────────────────────────────────────────

  /**
   * Check whether the platform has been initialized (at least one sentry-internal user exists).
   */
  async isInitialized(): Promise<boolean> {
    const sentryTenant = await this.getSentryTenant();
    if (!sentryTenant) return false;

    const role = await this.getSentryInternalRole(sentryTenant.id);
    if (!role) return false;

    const count = await this.userRoleRepository.count({
      where: { roleId: role.id, tenantId: sentryTenant.id },
    });
    return count > 0;
  }

  /**
   * Create the very first superadmin. Only callable when isInitialized() === false.
   * Requires a valid X-Setup-Token header obtained from the auth service startup logs.
   */
  async createFirstAdmin(
    dto: CreateFirstAdminDto,
    setupToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<FirstAdminResultDto> {
    if (!this.validateSetupToken(setupToken)) {
      throw new ForbiddenException("Invalid or expired setup token");
    }

    if (await this.isInitialized()) {
      throw new ConflictException("Platform is already initialized");
    }

    const sentryTenant = await this.getSentryTenant();
    if (!sentryTenant) {
      throw new NotFoundException(
        "Scrolloop Sentry tenant not found — run database seeds first",
      );
    }

    // Validate password strength
    const validation = PasswordService.validateStrength(dto.password);
    if (!validation.isValid) {
      throw new BadRequestException({
        message: "Password does not meet security requirements",
        errors: validation.errors,
      });
    }

    // Check if user already exists in the sentry tenant
    const existing = await this.userRepository.findOne({
      where: { email: dto.email, tenantId: sentryTenant.id },
    });
    if (existing) {
      throw new ConflictException("A user with this email already exists");
    }

    const passwordHash = await PasswordService.hash(dto.password);
    const nameParts = dto.name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? dto.name;
    const lastName = nameParts.slice(1).join(" ") || undefined;

    const user = this.userRepository.create({
      tenantId: sentryTenant.id,
      email: dto.email,
      emailVerified: true,
      firstName,
      lastName,
      displayName: dto.name,
      primaryAuthMethod: "password",
      passwordHash,
      isActive: true,
      mfaEnabled: false,
      failedLoginAttempts: 0,
      forcePasswordChange: false,
      passwordHistory: [],
      metadata: { source: "first-run-setup" },
    });

    const savedUser = await this.userRepository.save(user);

    // Assign ALL roles in the sentry tenant (includes sentry-internal + Owner, etc.)
    const allSentryRoles = await this.roleRepository.find({
      where: { tenantId: sentryTenant.id },
    });

    for (const role of allSentryRoles) {
      const userRole = this.userRoleRepository.create({
        tenantId: sentryTenant.id,
        userId: savedUser.id,
        roleId: role.id,
        reason: "First-run setup",
        metadata: { source: "setup" },
      });
      await this.userRoleRepository.save(userRole);
    }

    // Issue session + tokens
    const session = await this.sessionService.createSession({
      userId: savedUser.id,
      tenantId: sentryTenant.id,
      email: savedUser.email,
      ipAddress,
      userAgent,
    });

    const { token: refreshToken } = await this.oauthRefreshTokenService.createRefreshToken({
      tenantId: sentryTenant.id,
      userId: savedUser.id,
      sessionId: session.id,
      clientId: undefined,
      ipAddress,
      userAgent,
      expiresInDays: 30,
    });

    const { kid, privateKey } = await this.jwksService.getCurrentSigningKey(sentryTenant.id);
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

    // Get role names for groups claim
    const groups = allSentryRoles.map((r) => r.name).filter(Boolean);

    const accessToken = this.jwtService.sign(
      {
        sub: savedUser.id,
        email: savedUser.email,
        tenantId: sentryTenant.id,
        tenantSlug: sentryTenant.slug,
        groups,
        sessionId: session.id,
      },
      {
        privateKey: privateKeyPem,
        algorithm: "RS256",
        header: { alg: "RS256", kid },
        expiresIn: "15m",
      },
    );

    this.invalidateSetupToken();

    return {
      accessToken,
      refreshToken,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        name: dto.name,
      },
    };
  }
}
