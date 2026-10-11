import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { KeyPair, OAuthRefreshToken, SecurityEvent } from "@repo/database";
import { RedisService } from "@/common/service/redis.service";
import { SecurityEventService } from "@/common/service/security-event.service";
import { SessionService } from "@/common/service/session.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";

/**
 * SharedServicesModule
 *
 * Owns every cross-cutting, stateful service that must exist exactly ONCE per
 * process. Registering these classes in several feature modules' `providers`
 * creates one instance per module, which previously caused:
 *
 *   - JwksService ×3   → racing platform-key generation on first boot and a
 *                        JWKS endpoint that only published one instance's key
 *   - RedisService ×7  → seven Redis connections per process
 *   - SessionService ×4, OAuthRefreshTokenService ×5, SecurityEventService ×6
 *
 * Rule: feature modules MUST NOT list these classes in `providers`.
 * They are injected from here (this module is @Global).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([KeyPair, OAuthRefreshToken, SecurityEvent])],
  providers: [
    RedisService,
    SecurityEventService,
    SessionService,
    JwksService,
    OAuthRefreshTokenService,
  ],
  exports: [
    RedisService,
    SecurityEventService,
    SessionService,
    JwksService,
    OAuthRefreshTokenService,
  ],
})
export class SharedServicesModule {}
