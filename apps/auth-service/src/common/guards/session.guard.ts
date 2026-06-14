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
  ) {}

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
    const session = await this.sessionRepository.findOne({
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
    this.updateLastActivity(sessionId).catch((err) => {
      this.logger.error("Failed to update last activity", {
        sessionId,
        error: err.message,
      });
    });

    this.logger.debug("Session validated", { sessionId });

    return true;
  }

  private async updateLastActivity(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      lastActivity: new Date(),
    });
  }
}
