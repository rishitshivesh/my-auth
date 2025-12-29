// apps/auth-service/src/common/guards/session.guard.ts
// FIXED VERSION - No conflict with express-session

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
 * Validates that the session referenced in the JWT:
 * 1. Exists in the database
 * 2. Belongs to the same user
 * 3. Belongs to the same tenant
 * 4. Is not revoked
 * 5. Is not expired
 *
 * IMPORTANT: Attaches to req.fortknoxSession (NOT req.session)
 * to avoid conflict with express-session middleware
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

    // Step 1: Extract session ID from token payload
    const user = request.user;
    const sessionId = user?.sessionId;

    if (!sessionId) {
      this.logger.error("SessionGuard: No sessionId in token payload", {
        userId: user?.sub,
        email: user?.email,
      });
      throw new UnauthorizedException(
        "Invalid token: missing session reference",
      );
    }

    // Step 2: Fetch session from database
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        revokedAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
        lastActivity: true,
        deviceId: true,
        createdAt: true,
      },
    });

    if (!session) {
      this.logger.warn("SessionGuard: Session not found", {
        sessionId,
        userId: user.sub,
        ip: request.ip,
      });
      throw new UnauthorizedException("Session not found. Please login again.");
    }

    // Step 3: Verify session belongs to same user
    if (session.userId !== user.sub) {
      this.logger.error("SessionGuard: Session user mismatch", {
        sessionId,
        sessionUserId: session.userId,
        tokenUserId: user.sub,
      });
      throw new UnauthorizedException("Session does not belong to this user");
    }

    // Step 4: Verify session belongs to same tenant
    if (session.tenantId !== request.tenantId) {
      this.logger.error("SessionGuard: Session tenant mismatch", {
        sessionId,
        sessionTenant: session.tenantId,
        requestTenant: request.tenantId,
      });
      throw new UnauthorizedException("Session does not belong to this tenant");
    }

    // Step 5: Check if session is revoked
    if (session.revokedAt) {
      this.logger.warn("SessionGuard: Session revoked", {
        sessionId,
        userId: user.sub,
        revokedAt: session.revokedAt,
      });
      throw new UnauthorizedException(
        "Session has been revoked. Please login again.",
      );
    }

    // Step 6: Check if session is expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      this.logger.warn("SessionGuard: Session expired", {
        sessionId,
        userId: user.sub,
        expiresAt: session.expiresAt,
      });
      throw new UnauthorizedException(
        "Session has expired. Please login again.",
      );
    }

    // Step 7: Attach session to request
    // IMPORTANT: Use fortknoxSession to avoid conflict with express-session
    request.fortknoxSession = session;

    // Step 8: Update last activity (optional, non-blocking)
    this.updateLastActivity(sessionId).catch((err) => {
      this.logger.error("Failed to update last activity", {
        sessionId,
        error: err.message,
      });
    });

    this.logger.debug("Session validated successfully", {
      sessionId,
      userId: user.sub,
      tenantId: session.tenantId,
    });

    return true;
  }

  /**
   * Update session last activity timestamp
   * Non-blocking, fire-and-forget
   */
  private async updateLastActivity(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      lastActivity: new Date(),
    });
  }
}
