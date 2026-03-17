import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { RedisService } from "@/common/service/redis.service";

const THIRTY_FIVE_DAYS_SECONDS = 35 * 24 * 60 * 60;

/**
 * Increments a per-tenant, per-day API call counter in Redis on every
 * successful request.  Key format (via RedisService.buildKey):
 *   fortknox:t:{tenantId}:api_calls:{YYYY-MM-DD}
 * TTL is set to 35 days from the current date so old keys self-expire.
 */
@Injectable()
export class ApiCallInterceptor implements NestInterceptor {
  constructor(private readonly redisService: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(() => {
        const req = context.switchToHttp().getRequest<any>();
        const tenantId: string | undefined = req.tenantId;
        if (!tenantId) return;

        const date = new Date().toISOString().split("T")[0] as string;
        const expireAt =
          Math.floor(Date.now() / 1000) + THIRTY_FIVE_DAYS_SECONDS;

        // Fire-and-forget — counter failures must not affect the response
        this.redisService
          .incr(tenantId, "api_calls", date)
          .then(() =>
            this.redisService.expireAtTimestamp(
              tenantId,
              "api_calls",
              date,
              expireAt,
            ),
          )
          .catch(() => {
            /* swallow */
          });
      }),
    );
  }
}
