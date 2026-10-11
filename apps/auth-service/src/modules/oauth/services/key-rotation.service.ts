import { Injectable } from "@nestjs/common";
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
 * The platform key is rotated the same way but outside the per-tenant
 * advisory lock (it isn't a tenant) — see ADR-0004's Consequences for why
 * that's an accepted, harmless gap rather than a second lock primitive.
 */
@Injectable()
export class KeyRotationService {
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
    const activeTtlDays = this.configService.get<number>("KEY_ACTIVE_TTL_DAYS", 90);
    const graceDays = this.configService.get<number>("KEY_ROTATION_GRACE_DAYS", 7);

    await this.jwksService.rotateIfDue(null, activeTtlDays);

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
  }
}
