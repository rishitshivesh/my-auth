import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { TenantJobRunner } from "@/core/database/tenant-job-runner.service";
import { JwksService } from "./jwks.service";
import { logger } from "@/common/logger";

/**
 * Scheduled signing-key rotation and grace-period cleanup (ADR-0004).
 *
 * Runs daily, after TokenCleanupService's 2 AM jobs. Per active tenant:
 *   - rotates the active key once it's older than KEY_ACTIVE_TTL_DAYS
 *   - provisions a key for any tenant that somehow has none (the backfill
 *     path for tenants created before per-tenant keys existed)
 * Then revokes any retired key past KEY_ROTATION_GRACE_DAYS, so tokens
 * signed before a rotation keep verifying only within that grace window.
 *
 * The platform key's rotation runs under its own cluster-wide advisory
 * lock (TenantJobRunner.runExclusive) — without it, two replicas racing
 * the 3 AM cron could each decide the platform key is due and both
 * generate a new "active" row, leaving two simultaneously-active platform
 * keys with nothing to reconcile them.
 */
@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);

  constructor(
    private readonly jwksService: JwksService,
    private readonly tenantJobRunner: TenantJobRunner,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: "key-rotation-daily",
    timeZone: "UTC",
  })
  async dailyRotation(): Promise<void> {
    try {
      const activeTtlDays = this.configService.get<number>("KEY_ACTIVE_TTL_DAYS", 90);
      const graceDays = this.configService.get<number>("KEY_ROTATION_GRACE_DAYS", 7);

      await this.tenantJobRunner.runExclusive("key-rotation-platform", () =>
        this.jwksService.rotateIfDue(null, activeTtlDays),
      );

      const summary = await this.tenantJobRunner.forEachActiveTenant(
        "key-rotation-daily",
        async (tenant) => {
          await this.jwksService.rotateIfDue(tenant.id, activeTtlDays);
        },
      );

      const revoked = await this.jwksService.revokeExpiredRetiredKeys(graceDays);

      if (revoked > 0 || summary.tenantsFailed > 0) {
        logger.info({ revoked, ...summary }, "Daily key rotation finished");
      }
    } catch (error: unknown) {
      // Never let a rotation failure vanish silently — a stuck/misconfigured
      // rotation job (e.g. KEYRING_MASTER_KEY rotated out from under it)
      // should be loud, not leave keys un-rotated with no visibility.
      this.logger.error("Daily key rotation failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }
}
