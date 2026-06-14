import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Tenant } from "@repo/database";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { SessionManagementService } from "@/modules/session/session-management.service";

/**
 * TokenCleanupService
 *
 * Handles scheduled cleanup of expired/used tokens
 *
 * Runs:
 * - Daily at 2 AM: Full cleanup
 * - Hourly: Quick cleanup of expired tokens
 */
@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(
    private readonly oauthRefreshTokenService: OAuthRefreshTokenService,
    private readonly sessionManagementService: SessionManagementService,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Daily cleanup (2 AM)
   *
   * Comprehensive cleanup:
   * - Expired tokens
   * - Used tokens (rotation)
   * - Old revoked tokens (>30 days)
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: "token-cleanup-daily",
    timeZone: "UTC",
  })
  async dailyCleanup() {
    this.logger.log("🧹 Starting daily token cleanup...");

    const startTime = Date.now();
    let totalDeleted = 0;

    try {
      // Get all active tenants
      const tenants = await this.tenantRepository.find({
        where: { active: true },
        select: ["id", "name"],
      });

      this.logger.log(`Processing ${tenants.length} tenants...`);

      // Cleanup tokens for each tenant
      for (const tenant of tenants) {
        try {
          const deleted =
            await this.oauthRefreshTokenService.cleanupExpiredTokens(tenant.id);

          if (deleted > 0) {
            this.logger.log(
              `Cleaned up ${deleted} tokens for tenant ${tenant.name}`,
            );
            totalDeleted += deleted;
          }
        } catch (error: unknown) {
          this.logger.error(
            `Failed to cleanup tokens for tenant ${tenant.name}`,
            {
              error: error instanceof Error ? error.message : String(error),
              tenantId: tenant.id,
            },
          );
        }
      }

      const duration = Date.now() - startTime;

      this.logger.log("✅ Daily token cleanup completed", {
        totalDeleted,
        tenantsProcessed: tenants.length,
        durationMs: duration,
      });

      // Store metrics (optional)
      await this.recordCleanupMetrics({
        totalDeleted,
        tenantsProcessed: tenants.length,
        durationMs: duration,
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      this.logger.error("❌ Daily token cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Hourly quick cleanup
   *
   * Only deletes clearly expired tokens
   * Faster than daily cleanup
   */
  @Cron(CronExpression.EVERY_HOUR, {
    name: "token-cleanup-hourly",
    timeZone: "UTC",
  })
  async hourlyCleanup() {
    this.logger.debug("🧹 Starting hourly token cleanup...");

    try {
      // Quick cleanup without tenant iteration
      const deleted =
        await this.oauthRefreshTokenService.cleanupExpiredTokens();

      if (deleted > 0) {
        this.logger.log(`Hourly cleanup: deleted ${deleted} expired tokens`);
      }
    } catch (error: unknown) {
      this.logger.error("❌ Hourly token cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 15-minute session cleanup
   *
   * Soft-deletes expired sessions and revokes their refresh tokens.
   */
  @Cron("*/15 * * * *", {
    name: "session-cleanup-15m",
    timeZone: "UTC",
  })
  async fifteenMinuteSessionCleanup() {
    this.logger.debug("🧹 Starting 15-minute session cleanup...");

    try {
      const { sessionsCleanedUp, tokensRevoked } =
        await this.sessionManagementService.cleanupExpiredSessions();

      if (sessionsCleanedUp > 0) {
        this.logger.log(
          `15m session cleanup: removed ${sessionsCleanedUp} sessions, revoked ${tokensRevoked} tokens`,
        );
      }
    } catch (error: unknown) {
      this.logger.error("❌ 15-minute session cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Manual cleanup trigger (admin endpoint)
   */
  async manualCleanup(tenantId?: string): Promise<{
    deleted: number;
    durationMs: number;
  }> {
    this.logger.log("🧹 Starting manual token cleanup...", { tenantId });

    const startTime = Date.now();

    const deleted =
      await this.oauthRefreshTokenService.cleanupExpiredTokens(tenantId);

    const durationMs = Date.now() - startTime;

    this.logger.log("✅ Manual cleanup completed", {
      deleted,
      durationMs,
      tenantId,
    });

    return { deleted, durationMs };
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(tenantId?: string): Promise<{
    expiredTokens: number;
    usedTokens: number;
    revokedTokens: number;
    totalToCleanup: number;
  }> {
    // Implementation depends on your metrics storage
    // Could query database directly or read from metrics table
    return {
      expiredTokens: 0,
      usedTokens: 0,
      revokedTokens: 0,
      totalToCleanup: 0,
    };
  }

  /**
   * Record cleanup metrics for monitoring
   */
  private async recordCleanupMetrics(metrics: {
    totalDeleted: number;
    tenantsProcessed: number;
    durationMs: number;
    timestamp: Date;
  }): Promise<void> {
    // Store in metrics table or send to monitoring service
    // Example: CloudWatch, Datadog, Prometheus, etc.

    this.logger.debug("Cleanup metrics recorded", metrics);

    // TODO: Store in your metrics system
    // await this.metricsService.record('token.cleanup', metrics);
  }
}
