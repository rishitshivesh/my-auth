import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { Session } from "@repo/database";
import { SessionRepository } from "@/core/database/session.repository";

/**
 * SessionGuard
 *
 * ONLY validates session (no tenant checks - TenantBindingGuard does that)
 *
 * Runs AFTER:
 * - JwtAuthGuard (sets req.user)
 * - TenantBindingGuard (validates tenant match)
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new Logger(SessionGuard.name);

  constructor(private readonly sessionRepository: SessionRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const sessionId = user?.sessionId;

    if (!sessionId) {
      this.logger.error("SessionGuard: No sessionId in token payload");
      throw new UnauthorizedException(
        "Invalid token: missing session reference",
      );
    }

    // Fetch session from database
    const platformSlug = process.env.SENTRY_PLATFORM_SLUG ?? "sentry";
    const schemaName = user.isSuperAdmin ? `fk_${platformSlug}` : undefined;

    let session: Session | null = null;
    if (schemaName) {
      // Superadmin: query platform schema directly — TenantSchemaMiddleware does not run on superadmin routes
      const rows = await this.sessionRepository.executeRaw<Record<string, unknown>>(
        `SELECT * FROM "${schemaName}"."sessions" WHERE id = $1 LIMIT 1`,
        [sessionId],
      );
      const raw = rows[0];
      if (raw) {
        session = {
          id: raw['id'],
          userId: raw['user_id'],
          tenantId: raw['tenant_id'],
          revokedAt: raw['revoked_at'] ? new Date(raw['revoked_at'] as string) : null,
          expiresAt: raw['expires_at'] ? new Date(raw['expires_at'] as string) : null,
          lastActivity: raw['last_activity'] ? new Date(raw['last_activity'] as string) : null,
          ipAddress: raw['ip_address'],
          userAgent: raw['user_agent'],
          deviceId: raw['device_id'],
          createdAt: raw['created_at'] ? new Date(raw['created_at'] as string) : null,
        } as Session;
      }
    } else {
      // Regular tenant user: TenantSchemaMiddleware has already set search_path via AsyncLocalStorage.
      // SessionRepository uses the schema-scoped EntityManager — correct schema guaranteed.
      session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        select: {
          id: true,
          userId: true,
          tenantId: true,
          revokedAt: true,
          expiresAt: true,
          lastActivity: true,
          ipAddress: true,
          userAgent: true,
          deviceId: true,
          createdAt: true,
        },
      });
    }

    if (!session) {
      this.logger.warn("SessionGuard: Session not found", { sessionId });
      throw new UnauthorizedException("Session not found. Please login again.");
    }

    if (session.revokedAt) {
      this.logger.warn("SessionGuard: Session revoked", {
        sessionId,
        revokedAt: session.revokedAt,
      });
      throw new UnauthorizedException(
        "Session has been revoked. Please login again.",
      );
    }

    if (session.expiresAt && session.expiresAt < new Date()) {
      this.logger.warn("SessionGuard: Session expired", {
        sessionId,
        expiresAt: session.expiresAt,
      });
      throw new UnauthorizedException(
        "Session has expired. Please login again.",
      );
    }

    request.sentrySession = session;

    this.updateLastActivity(sessionId, schemaName).catch((err: Error) => {
      this.logger.error("Failed to update last activity", {
        sessionId,
        error: err.message,
      });
    });

    this.logger.debug("Session validated", { sessionId });

    return true;
  }

  private async updateLastActivity(sessionId: string, schemaName?: string): Promise<void> {
    if (schemaName) {
      await this.sessionRepository.executeRaw(
        `UPDATE "${schemaName}"."sessions" SET last_activity = $1 WHERE id = $2`,
        [new Date(), sessionId],
      );
    } else {
      await this.sessionRepository.update(sessionId, {
        lastActivity: new Date(),
      });
    }
  }
}
