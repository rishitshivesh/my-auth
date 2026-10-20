import { Injectable, OnModuleInit } from "@nestjs/common";
import { ApiException } from "../../common/http";
import { assertPasswordPolicy } from "../auth/password-policy";
import { hashPassword } from "../auth/password-hashing";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, IsNull, MoreThan, DataSource } from "typeorm";
import {
  User,
  Session,
  Tenant,
  SecurityEvent,
  Role,
  UserRole,
  Permission,
  RolePermission,
} from "@repo/database";
import { RedisService } from "@/common/service/redis.service";
import { SessionService } from "@/common/service/session.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, timingSafeEqual } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logger } from "@/common/logger";
import { TenantSchemaService } from "@/core/tenant/tenant-schema.service";
import type { CreateFirstAdminDto } from "./dto/create-first-admin.dto";

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

const SENTRY_TENANT_SLUG = process.env["SENTRY_PLATFORM_SLUG"] ?? "sentry";
const SENTRY_INTERNAL_ROLE = `${SENTRY_TENANT_SLUG}-internal`;
const logDir =
          process.env["SENTRY_SETUP_LOG_DIR"] ??
          path.join(os.homedir(), ".sentry");

function readSetupToken(): string | null {
  try {
    const content = fs.readFileSync(logDir, "utf8");

    const matches = [
      ...content.matchAll(/SETUP TOKEN:\s*([a-f0-9]{64})/gi)
    ];

    return matches.at(-1)?.[1] ?? null;
  } catch {
    return null;
  }
}
@Injectable()
export class AdminService implements OnModuleInit {
  private setupToken: string | null = null;
  private setupLogPath: string | null = null;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
    private readonly tenantSchemaService: TenantSchemaService,
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

      try {
        const logDir =
          process.env["SENTRY_SETUP_LOG_DIR"] ??
          path.join(os.homedir(), ".sentry");
        fs.mkdirSync(logDir, { recursive: true });
        const logPath = path.join(logDir, "setup.log");
        fs.writeFileSync(
          logPath,
          `[${new Date().toISOString()}] SETUP TOKEN: ${this.setupToken}\n`,
          { flag: "a" },
        );
        this.setupLogPath = logPath;
        logger.info({ logPath }, "Setup token written to file");
      } catch (err) {
        logger.warn({ err }, "Could not write setup token to file — check SENTRY_SETUP_LOG_DIR");
      }
    }
  }

  getSetupLogPath(): string | null {
    return this.setupLogPath;
  }

  private validateSetupToken(token: string): boolean {
    if (!this.setupToken) return false;
    try {

      const a = Buffer.from(token);
      const b = Buffer.from(this.setupToken);
      
      if (a.length !== b.length) return false;
      const ok = timingSafeEqual(a, b);
      logger.debug({ ok }, 'setup token check');
      return ok;
    } catch {
      return false;
    }
  }

  invalidateSetupToken(): void {
    this.setupToken = null;
  }

  /** True while the platform is awaiting first-run setup (token still active). */
  isBootstrapping(): boolean {
    return this.setupToken !== null;
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
    if (!tenant) throw new ApiException("TENANT_NOT_FOUND");

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
    useCurrentUserAsAdmin?: boolean;
    migrateProfile?: boolean;
    currentUserId?: string;
  }): Promise<TenantDetailDto> {
    // Validate slug format before any DB or SQL use (defense against identifier injection)
    if (!/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/.test(dto.slug)) {
      throw new ApiException("BAD_REQUEST", { detail: "Slug must be 4–63 characters, lowercase letters/numbers/hyphens, and cannot start or end with a hyphen" });
    }

    const existing = await this.tenantRepository.findOne({
      where: { slug: dto.slug },
    });
    if (existing) throw new ApiException("RESOURCE_CONFLICT", { detail: "Slug is already taken" });

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
    await this.jwksService.ensureTenantKeyExists(saved.id);

    if (dto.currentUserId) {
      await this.provisionAdminUser(saved.id, dto.slug, dto.currentUserId);
    }

    return this.getTenantById(saved.id);
  }

  private async provisionAdminUser(
    tenantId: string,
    slug: string,
    adminUserId: string,
  ): Promise<void> {
    // Escape double-quotes within identifier names (PostgreSQL: "" inside "…")
    const escId = (name: string) => name.replace(/"/g, '""');
    const schemaName = `fk_${slug}`;
    const sentrySchemaName = `fk_${SENTRY_TENANT_SLUG}`;
    await this.tenantSchemaService.createSchema(slug);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      // Load source user from sentry schema
      await qr.query(`SET search_path TO "${escId(sentrySchemaName)}", public, extensions`);
      const rows = (await qr.query(
        `SELECT id, email, password_hash, first_name, last_name, display_name, avatar_url
         FROM users WHERE id = $1 LIMIT 1`,
        [adminUserId],
      )) as Array<Record<string, string | null>>;

      if (!rows.length) {
        logger.warn({ adminUserId }, "provisionAdminUser: source user not found, skipping");
        return;
      }
      const src = rows[0]!;

      await qr.startTransaction();
      await qr.query(`SET search_path TO "${escId(schemaName)}", public, extensions`);

      // Create Owner role
      const roleRows = (await qr.query(
        `INSERT INTO roles (id, tenant_id, name, display_name, description, is_system, priority, scope, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, 'owner', 'Owner', 'Full control over the workspace', true, 100, 'tenant', now(), now())
         ON CONFLICT (tenant_id, name) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [tenantId],
      )) as Array<{ id: string }>;
      const ownerRoleId = roleRows[0]!.id;

      // Create user in new schema (same credentials)
      const userRows = (await qr.query(
        `INSERT INTO users (id, tenant_id, email, email_verified, first_name, last_name, display_name, avatar_url, password_hash, primary_auth_method, is_active, mfa_enabled, failed_login_attempts, force_password_change, password_history, metadata, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, $2, true, $3, $4, $5, $6, $7, 'password', true, false, 0, false, '[]', $8, now(), now())
         ON CONFLICT (tenant_id, email) DO NOTHING
         RETURNING id`,
        [
          tenantId,
          src['email'],
          src['first_name'],
          src['last_name'],
          src['display_name'],
          src['avatar_url'],
          src['password_hash'],
          JSON.stringify({ source: 'admin-provision', sourceUserId: adminUserId }),
        ],
      )) as Array<{ id: string }>;

      if (!userRows.length) {
        // User already exists (edge case: email collision)
        await qr.rollbackTransaction();
        return;
      }
      const newUserId = userRows[0]!.id;

      // Assign Owner role
      await qr.query(
        `INSERT INTO user_roles (id, tenant_id, user_id, role_id, reason, metadata, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, 'Admin provisioned', '{"source":"admin-provision"}', now(), now())
         ON CONFLICT DO NOTHING`,
        [tenantId, newUserId, ownerRoleId],
      );

      await qr.commitTransaction();
      logger.info({ tenantId, slug, adminUserId, newUserId }, "Admin user provisioned in new tenant");
    } catch (err) {
      try { await qr.rollbackTransaction(); } catch {}
      logger.error({ err, tenantId, slug, adminUserId }, "provisionAdminUser failed");
      // Non-fatal: tenant was already created; admin can log in via the portal
    } finally {
      try { await qr.query(`SET search_path TO public`); } catch {}
      await qr.release();
    }
  }

  async updateTenant(
    id: string,
    dto: { status?: string; name?: string; plan?: string },
  ): Promise<TenantDetailDto> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new ApiException("TENANT_NOT_FOUND");

    const updates: Partial<Tenant> = {};
    if (dto.name) updates.name = dto.name;
    if (dto.status) updates.active = dto.status === "active";
    if (dto.plan) (updates as unknown as Record<string, unknown>).plan = dto.plan;

    await this.tenantRepository.update({ id }, updates);
    return this.getTenantById(id);
  }

  async deleteTenant(id: string): Promise<void> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new ApiException("TENANT_NOT_FOUND");
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
    if (!sentryTenant) throw new ApiException("RESOURCE_NOT_FOUND");

    const user = await this.userRepository.findOne({
      where: { email, tenantId: sentryTenant.id },
    });
    if (!user) {
      throw new ApiException("RESOURCE_NOT_FOUND");
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
      throw new ApiException("RESOURCE_CONFLICT", { detail: `${email} is already a team member` });
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
    if (!sentryTenant) throw new ApiException("RESOURCE_NOT_FOUND");

    const role = await this.getSentryInternalRole(sentryTenant.id);
    if (!role) throw new ApiException("RESOURCE_NOT_FOUND");

    const userRole = await this.userRoleRepository.findOne({
      where: { userId, roleId: role.id, tenantId: sentryTenant.id },
    });
    if (!userRole) throw new ApiException("RESOURCE_NOT_FOUND");

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
    if (!sentryTenant) throw new ApiException("RESOURCE_NOT_FOUND");

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
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    try {
      // 1. Get the platform tenant from public (tenants table is in public schema, which is in search_path)
      await qr.query(`SET search_path TO public, extensions`);
      const tenantRepo = qr.manager.getRepository(Tenant);
      const sentryTenant = await tenantRepo.findOne({
        where: { slug: SENTRY_TENANT_SLUG },
      });
      if (!sentryTenant) return false;

      // 2. Query role and userRole in fk_sentry schema
      await qr.query(`SET search_path TO "fk_${SENTRY_TENANT_SLUG}", public, extensions`);
      const roleRepo = qr.manager.getRepository(Role);
      const role = await roleRepo.findOne({
        where: { name: SENTRY_INTERNAL_ROLE, tenantId: sentryTenant.id },
      });
      if (!role) return false;

      const userRoleRepo = qr.manager.getRepository(UserRole);
      const count = await userRoleRepo.count({
        where: { roleId: role.id, tenantId: sentryTenant.id },
      });
      return count > 0;
    } catch (err) {
      logger.warn({ err }, "Platform initialization check failed (database may not be fully migrated or seeded)");
      return false;
    } finally {
      // Reset search_path before returning the connection to the pool.
      // If we set it to fk_sentry and then don't reset, the next request that
      // picks up this pooled connection will run queries in the wrong schema.
      try { await qr.query(`SET search_path TO public`); } catch {}
      await qr.release();
    }
  }

  /**
   * Public endpoint response: platform identity + initialization state.
   * Used by the admin portal middleware to cache slug and skip /setup when initialized.
   */
  async getPlatformInfo(): Promise<{ slug: string; name: string; initialized: boolean }> {
    const slug = SENTRY_TENANT_SLUG;
    const tenant = await this.getSentryTenant();
    const name = tenant?.name ?? (process.env["SENTRY_PLATFORM_NAME"] ?? "Scrolloop Sentry");
    const initialized = await this.isInitialized();
    return { slug, name, initialized };
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
      throw new ApiException("ACCESS_FORBIDDEN", { detail: "Invalid or expired setup token" });
    }

    if (await this.isInitialized()) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: "Platform is already initialized" });
    }

    // Ensure the sentry tenant row exists in public.tenants
    let sentryTenant = await this.getSentryTenant();
    if (!sentryTenant) {
      sentryTenant = await this.tenantRepository.save(
        this.tenantRepository.create({
          name: dto.platformName?.trim() || "Scrolloop Sentry",
          slug: SENTRY_TENANT_SLUG,
          environment: "production",
          active: true,
          featureFlags: {
            mfaRequired: false,
            passwordlessEnabled: true,
            socialProvidersEnabled: false,
          },
        } as Partial<Tenant>),
      );
      logger.info("Sentry platform tenant bootstrapped during first-run setup");
    }

    // Validate password before doing any more writes
    assertPasswordPolicy(dto.password, { email: dto.email });

    // Create the fk_sentry schema so all tenant-scoped tables land there,
    // not in public. This matches the schema-per-tenant architecture.
    const schemaName = `fk_${SENTRY_TENANT_SLUG}`;
    await this.tenantSchemaService.createSchema(SENTRY_TENANT_SLUG);
    logger.info({ schemaName }, "Sentry tenant schema ensured");

    // All role/user/user_role writes happen inside a QueryRunner that sets
    // search_path so TypeORM routes them into fk_sentry, not public.
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();

    let savedUser: User;
    let allSentryRoles: Role[];

    try {
      // SET LOCAL only takes effect within a transaction; outside one it is a no-op.
      // Use a plain SET so the search_path persists for the life of this connection.
      await qr.query(`SET search_path TO "${schemaName}", public, extensions`);
      await qr.startTransaction();

      // Check for duplicate email in the tenant schema
      const existing = await qr.manager.findOne(User, {
        where: { email: dto.email, tenantId: sentryTenant.id },
      });
      if (existing) {
        throw new ApiException("RESOURCE_CONFLICT", { detail: "A user with this email already exists" });
      }

      // Ensure sentry-internal role exists in fk_sentry.roles
      let internalRole = await qr.manager.findOne(Role, {
        where: { name: SENTRY_INTERNAL_ROLE, tenantId: sentryTenant.id },
      });
      if (!internalRole) {
        internalRole = await qr.manager.save(
          qr.manager.create(Role, {
            name: SENTRY_INTERNAL_ROLE,
            description: "Scrolloop Sentry platform superadmin",
            tenantId: sentryTenant.id,
            isSystem: true,
          } as Partial<Role>),
        );
        logger.info("sentry-internal role bootstrapped in fk_sentry schema");
      }

      // Ensure wildcard permission exists in fk_sentry.permissions
      let wildcardPermission = await qr.manager.findOne(Permission, {
        where: { tenantId: sentryTenant.id, name: "*:*" },
      });
      if (!wildcardPermission) {
        wildcardPermission = await qr.manager.save(
          qr.manager.create(Permission, {
            resource: "*",
            action: "*",
            name: "*:*",
            description: "Full wildcard permission — grants access to all resources and actions",
            tenantId: sentryTenant.id,
          }),
        );
        logger.info("wildcard permission *:* bootstrapped in fk_sentry schema");
      }

      // Ensure sentry-internal role has the wildcard permission
      const hasWildcardPermission = await qr.manager.findOne(RolePermission, {
        where: { tenantId: sentryTenant.id, roleId: internalRole.id, permissionId: wildcardPermission.id },
      });
      if (!hasWildcardPermission) {
        await qr.manager.save(
          qr.manager.create(RolePermission, {
            tenantId: sentryTenant.id,
            roleId: internalRole.id,
            permissionId: wildcardPermission.id,
            assignedAt: new Date(),
          }),
        );
        logger.info("Assigned *:* permission to sentry-internal role in fk_sentry schema");
      }

      // Create superadmin user in fk_sentry.users
      const passwordHash = await hashPassword(dto.password);
      const nameParts = dto.name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? dto.name;
      const lastName = nameParts.slice(1).join(" ") || undefined;

      savedUser = await qr.manager.save(
        qr.manager.create(User, {
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
        } as Partial<User>),
      );

      // Assign all roles in the sentry tenant to this user
      allSentryRoles = await qr.manager.find(Role, {
        where: { tenantId: sentryTenant.id },
      });

      for (const role of allSentryRoles) {
        await qr.manager.save(
          qr.manager.create(UserRole, {
            tenantId: sentryTenant.id,
            userId: savedUser.id,
            roleId: role.id,
            reason: "First-run setup",
            metadata: { source: "setup" },
          } as Partial<UserRole>),
        );
      }

      await qr.commitTransaction();
    } catch (err) {
      try { await qr.rollbackTransaction(); } catch {}
      throw err;
    } finally {
      // Reset search_path before returning the connection to the pool.
      // Guard each operation independently so a broken connection can't block release().
      try { await qr.query(`SET search_path TO public`); } catch {}
      await qr.release();
    }

    // Issue session + tokens (session/refresh-token writes go through their own
    // services which use the TenantContextService / public schema as appropriate)
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

    // Tokens are returned to the controller which sets them as httpOnly cookies.
    // They are never included in the JSON response body.
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
