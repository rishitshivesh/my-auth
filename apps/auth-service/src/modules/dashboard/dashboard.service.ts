import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, MoreThan } from "typeorm";
import {
  User,
  Session,
  OAuthClient,
  SecurityEvent,
  UserSocialConnection,
  WebAuthnCredential,
} from "@repo/database";
import { RedisService } from "@/common/service/redis.service";

export interface TenantMetricsDto {
  totalUsers: number;
  activeSessions: number;
  totalApplications: number;
  mfaAdoptionRate: number;
  activeApiKeys: number;
}

export interface ActivityEventDto {
  id: string;
  eventType: string;
  actorEmail?: string;
  ipAddress: string;
  location?: string;
  createdAt: Date;
  severity: string;
  resourceType?: string;
  resourceId?: string;
}

export interface TrendPointDto {
  date: string;
  count: number;
}

export interface AuthBreakdownDto {
  emailPassword: number;
  google: number;
  github: number;
  microsoft: number;
  apple: number;
  passkey: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(OAuthClient)
    private readonly oauthClientRepository: Repository<OAuthClient>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
    @InjectRepository(UserSocialConnection)
    private readonly socialConnectionRepository: Repository<UserSocialConnection>,
    @InjectRepository(WebAuthnCredential)
    private readonly webAuthnRepository: Repository<WebAuthnCredential>,
    private readonly redisService: RedisService,
  ) {}

  async getTenantMetrics(tenantId: string): Promise<TenantMetricsDto> {
    const [totalUsers, mfaUsers, activeSessions, totalApplications] =
      await Promise.all([
        this.userRepository.count({ where: { tenantId } }),
        this.userRepository.count({ where: { tenantId, mfaEnabled: true } }),
        this.sessionRepository.count({
          where: {
            tenantId,
            expiresAt: MoreThan(new Date()),
            revokedAt: IsNull(),
          },
        }),
        this.oauthClientRepository.count({ where: { tenantId } }),
      ]);

    const mfaAdoptionRate = totalUsers > 0 ? mfaUsers / totalUsers : 0;

    return {
      totalUsers,
      activeSessions,
      totalApplications,
      mfaAdoptionRate,
      activeApiKeys: 0, // no api_keys table yet
    };
  }

  async getTenantActivity(
    tenantId: string,
    limit = 20,
  ): Promise<ActivityEventDto[]> {
    const events = await this.securityEventRepository.find({
      where: { tenantId },
      order: { createdAt: "DESC" },
      take: limit,
    });

    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      actorEmail: e.actorEmail,
      ipAddress: e.ipAddress,
      location: e.location,
      createdAt: e.createdAt,
      severity: e.severity,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
    }));
  }

  async getApiCallTrend(
    tenantId: string,
    days: 7 | 14 | 30 = 7,
  ): Promise<TrendPointDto[]> {
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0] as string);
    }

    const counts = await this.redisService.getDailyApiCallCounts(
      tenantId,
      dates,
    );

    return dates.map((date, i) => ({ date, count: counts[i] ?? 0 }));
  }

  async getAuthMethodBreakdown(tenantId: string): Promise<AuthBreakdownDto> {
    const [socialRows, passkeyCount, emailPasswordCount] = await Promise.all([
      this.socialConnectionRepository
        .createQueryBuilder("sc")
        .select("sc.provider", "provider")
        .addSelect("COUNT(*)", "count")
        .where("sc.tenantId = :tenantId", { tenantId })
        .groupBy("sc.provider")
        .getRawMany<{ provider: string; count: string }>(),

      this.webAuthnRepository.count({ where: { tenantId } }),

      this.userRepository
        .createQueryBuilder("u")
        .where("u.tenantId = :tenantId", { tenantId })
        .andWhere(
          `u.id NOT IN (
            SELECT DISTINCT usc.user_id
            FROM user_social_connections usc
            WHERE usc.tenant_id = :tenantId
          )`,
          { tenantId },
        )
        .getCount(),
    ]);

    const providerMap: Record<string, number> = {};
    for (const row of socialRows) {
      providerMap[row.provider] = parseInt(row.count, 10);
    }

    return {
      emailPassword: emailPasswordCount,
      google: providerMap["google"] ?? 0,
      github: providerMap["github"] ?? 0,
      microsoft: providerMap["microsoft"] ?? 0,
      apple: providerMap["apple"] ?? 0,
      passkey: passkeyCount,
    };
  }
}
