import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RedisService } from "@/common/service/redis.service";
import { SlidingWindowRateLimiter } from "@repo/security";
import {
  RATE_LIMIT_KEY,
  RateLimitConfig,
} from "@/common/decorators/rate-limit.decorator";

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.get<RateLimitConfig>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!config) return true;

    // Dev-only escape hatch — never active in production
    if (
      process.env["NODE_ENV"] === "development" &&
      process.env["DISABLE_RATE_LIMIT"] === "true"
    ) {
      this.logger.debug("Rate limiting disabled via DISABLE_RATE_LIMIT env var");
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const ip = request.ip;

    const key = this.buildKey(config, request);

    const limiter = new SlidingWindowRateLimiter(this.redisService.getClient());
    const result = await limiter.isAllowed(key, {
      maxRequests: config.max,
      windowMs: config.windowMs,
      keyPrefix: "rl",
    });

    const response = context.switchToHttp().getResponse();
    response.setHeader("X-RateLimit-Limit", config.max);
    response.setHeader("X-RateLimit-Remaining", result.remaining);
    response.setHeader("X-RateLimit-Reset", result.resetAt.toISOString());

    if (!result.allowed) {
      const retryAfter = result.retryAfter ?? Math.ceil(config.windowMs / 1000);
      response.setHeader("Retry-After", retryAfter);
      throw new HttpException(
        {
          statusCode: 429,
          error: "Too Many Requests",
          message: "Rate limit exceeded",
        },
        429,
      );
    }

    return true;
  }

  // Unused — kept as dead code marker; RFC1918 bypass removed (HIGH security finding).
  // Only socket-level loopback is trusted; request.ip is X-Forwarded-For-derived
  // and trivially spoofable. Use DISABLE_RATE_LIMIT=true in development instead.

  private buildKey(config: RateLimitConfig, request: Record<string, unknown>): string {
    const req = request as { ip?: string; user?: { sub?: string }; path?: string };
    if (config.keyBy === "user" && req.user?.sub) {
      return `${req.user.sub}:${req.path}`;
    }
    return `${req.ip}:${req.path}`;
  }
}
