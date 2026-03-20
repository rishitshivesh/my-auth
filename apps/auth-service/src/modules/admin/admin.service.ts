import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
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

export interface TenantDetailDto extends TenantListItemDto {
  featureFlags: Record<string, boolean>;
  settings: Record<string, any>;
  activeSessions: number;
  recentActivity: any[];
}

export interface TeamMemberDto {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  addedAt?: Date;
}

export interface PlatformSettingsDto {
  platformName: string;
  smtpConfigured: boolean;
  smtpHost?: string;
  supportEmail?: string;
  allowPublicSignup: boolean;
  maintenanceMode: boolean;
}

const FORTKNOX_TENANT_SLUG = "fortknox";
const FORTKNOX_INTERNAL_ROLE = "fortknox-internal";

@Injectable()
export class AdminService {
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
  ) {}

  private async getFortKnoxTenant(): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { slug: FORTKNOX_TENANT_SLUG } });
  }

  private async getFortKnoxInternalRole(tenantId: string): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { name: FORTKNOX_INTERNAL_ROLE, tenantId },
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
        plan: (t as any).plan ?? "free",
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
        where: { tenantId: id, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
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
      plan: (tenant as any).plan ?? "free",
      status: tenant.active ? "active" : "suspended",
      userCount,
      createdAt: tenant.createdAt,
      environment: tenant.environment,
      customDomain: tenant.customDomain,
      featureFlags: tenant.featureFlags ?? {},
      settings: (tenant as any).settings ?? {},
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
    } as any);
    if (dto.plan) (tenant as any).plan = dto.plan;

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
    if (dto.plan) (updates as any).plan = dto.plan;

    await this.tenantRepository.update({ id }, updates);
    return this.getTenantById(id);
  }

  async deleteTenant(id: string): Promise<void> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    await this.tenantRepository.delete({ id });
  }

  async checkSlugAvailability(slug: string): Promise<{ available: boolean; reason?: string }> {
    const RESERVED = [
      "admin", "api", "auth", "www", "mail", "smtp", "fortknox",
      "support", "help", "status", "billing", "dashboard", "login",
      "logout", "signup", "register",
    ];

    if (slug.length < 4) return { available: false, reason: "Slug must be at least 4 characters" };
    if (slug.length > 63) return { available: false, reason: "Slug must be 63 characters or less" };
    if (!/^[a-z0-9-]+$/.test(slug)) return { available: false, reason: "Only lowercase letters, numbers, and hyphens allowed" };
    if (slug.startsWith("-") || slug.endsWith("-")) return { available: false, reason: "Slug cannot start or end with a hyphen" };
    if (RESERVED.includes(slug)) return { available: false, reason: "This slug is reserved" };

    // Check Redis reservation
    const reservationKey = `slug:reservation:${slug}`;
    const reserved = await this.redisService.get(reservationKey).catch(() => null);
    if (reserved) return { available: false, reason: "This slug is being claimed by another user" };

    // Check database
    const existing = await this.tenantRepository.findOne({ where: { slug } });
    if (existing) return { available: false, reason: "This slug is already taken" };

    // Reserve for 5 minutes
    await this.redisService.set(reservationKey, "pending", 300).catch(() => {});

    return { available: true };
  }

  async getRecentActivity(limit = 20): Promise<any[]> {
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
    const fkTenant = await this.getFortKnoxTenant();
    if (!fkTenant) return [];

    const role = await this.getFortKnoxInternalRole(fkTenant.id);
    if (!role) return [];

    const userRoles = await this.userRoleRepository.find({
      where: { roleId: role.id, tenantId: fkTenant.id },
      relations: ["user"],
    });

    return userRoles.map((ur) => ({
      id: ur.user.id,
      email: ur.user.email,
      firstName: (ur.user as any).firstName,
      lastName: (ur.user as any).lastName,
      addedAt: ur.assignedAt,
    }));
  }

  async addTeamMember(email: string): Promise<TeamMemberDto> {
    const fkTenant = await this.getFortKnoxTenant();
    if (!fkTenant) throw new NotFoundException("Fort Knox tenant not found");

    const user = await this.userRepository.findOne({
      where: { email, tenantId: fkTenant.id },
    });
    if (!user) {
      throw new NotFoundException(`No user with email "${email}" found in the fortknox tenant`);
    }

    let role = await this.getFortKnoxInternalRole(fkTenant.id);
    if (!role) {
      role = this.roleRepository.create({
        name: FORTKNOX_INTERNAL_ROLE,
        description: "Fort Knox platform superadmin",
        tenantId: fkTenant.id,
        isSystem: true,
      } as any);
      role = await this.roleRepository.save(role);
    }

    const existing = await this.userRoleRepository.findOne({
      where: { userId: user.id, roleId: role.id, tenantId: fkTenant.id },
    });
    if (existing) {
      throw new ConflictException(`${email} is already a team member`);
    }

    const userRole = this.userRoleRepository.create({
      userId: user.id,
      roleId: role.id,
      tenantId: fkTenant.id,
    });
    await this.userRoleRepository.save(userRole);

    return {
      id: user.id,
      email: user.email,
      firstName: (user as any).firstName,
      lastName: (user as any).lastName,
      addedAt: userRole.assignedAt,
    };
  }

  async removeTeamMember(userId: string): Promise<void> {
    const fkTenant = await this.getFortKnoxTenant();
    if (!fkTenant) throw new NotFoundException("Fort Knox tenant not found");

    const role = await this.getFortKnoxInternalRole(fkTenant.id);
    if (!role) throw new NotFoundException("Role not found");

    const userRole = await this.userRoleRepository.findOne({
      where: { userId, roleId: role.id, tenantId: fkTenant.id },
    });
    if (!userRole) throw new NotFoundException("Team member not found");

    await this.userRoleRepository.delete({ id: userRole.id });
  }

  // ─── Platform Settings ───────────────────────────────────────────

  async getPlatformSettings(): Promise<PlatformSettingsDto> {
    const fkTenant = await this.getFortKnoxTenant();
    const stored = (fkTenant as any)?.settings ?? {};

    return {
      platformName: stored.platformName ?? "Fort Knox",
      smtpConfigured: !!(process.env.SMTP_HOST || stored.smtpHost),
      smtpHost: stored.smtpHost ?? process.env.SMTP_HOST ?? undefined,
      supportEmail: stored.supportEmail ?? process.env.SUPPORT_EMAIL ?? undefined,
      allowPublicSignup: stored.allowPublicSignup ?? false,
      maintenanceMode: stored.maintenanceMode ?? false,
    };
  }

  async updatePlatformSettings(dto: Partial<PlatformSettingsDto>): Promise<PlatformSettingsDto> {
    const fkTenant = await this.getFortKnoxTenant();
    if (!fkTenant) throw new NotFoundException("Fort Knox tenant not found");

    const current = (fkTenant as any).settings ?? {};
    const updated = { ...current };

    if (dto.platformName !== undefined) updated.platformName = dto.platformName;
    if (dto.smtpHost !== undefined) updated.smtpHost = dto.smtpHost;
    if (dto.supportEmail !== undefined) updated.supportEmail = dto.supportEmail;
    if (dto.allowPublicSignup !== undefined) updated.allowPublicSignup = dto.allowPublicSignup;
    if (dto.maintenanceMode !== undefined) updated.maintenanceMode = dto.maintenanceMode;

    await this.tenantRepository.update({ id: fkTenant.id }, { settings: updated } as any);
    return this.getPlatformSettings();
  }
}
