import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Session } from "@repo/database";

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

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) { }

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

    let session;
    if (schemaName) {
      // Query the platform schema directly with raw SQL to bypass active search_path for superadmin
      const rows = await this.sessionRepository.manager.query(
        `SELECT * FROM "${schemaName}"."sessions" WHERE id = $1 LIMIT 1`,
        [sessionId]
      );
      const rawSession = rows[0];
      if (rawSession) {
        session = {
          id: rawSession.id,
          userId: rawSession.user_id,
          tenantId: rawSession.tenant_id,
          revokedAt: rawSession.revoked_at ? new Date(rawSession.revoked_at) : null,
          expiresAt: rawSession.expires_at ? new Date(rawSession.expires_at) : null,
          lastActivity: rawSession.last_activity ? new Date(rawSession.last_activity) : null,
          ipAddress: rawSession.ip_address,
          userAgent: rawSession.user_agent,
          deviceId: rawSession.device_id,
          createdAt: rawSession.created_at ? new Date(rawSession.created_at) : null,
        } as Session;
      }
    } else {
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

    // Check if session is revoked
    if (session.revokedAt) {
      this.logger.warn("SessionGuard: Session revoked", {
        sessionId,
        revokedAt: session.revokedAt,
      });
      throw new UnauthorizedException(
        "Session has been revoked. Please login again.",
      );
    }

    // Check if session is expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      this.logger.warn("SessionGuard: Session expired", {
        sessionId,
        expiresAt: session.expiresAt,
      });
      throw new UnauthorizedException(
        "Session has expired. Please login again.",
      );
    }

    // Attach session to request
    request.sentrySession = session;

    // Update last activity (non-blocking)
    this.updateLastActivity(sessionId, schemaName).catch((err) => {
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
      await this.sessionRepository.manager.query(
        `UPDATE "${schemaName}"."sessions" SET last_activity = $1 WHERE id = $2`,
        [new Date(), sessionId]
      );
    } else {
      await this.sessionRepository.update(sessionId, {
        lastActivity: new Date(),
      });
    }
  }
}
