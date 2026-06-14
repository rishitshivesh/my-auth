import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { GlobalModule } from "./global";
import { StatsModule } from "./stats/stats.module";
import { DatabaseModule } from "@/core/database/database.module";
import { CombinedModules } from "@/modules";
import { ApiCallInterceptor } from "@/common/interceptors/api-call.interceptor";
import { RedisService } from "@/common/service/redis.service";
import { RateLimitGuard } from "@/common/guards/rate-limit.guard";

@Module({
  imports: [GlobalModule, StatsModule, DatabaseModule, CombinedModules],
  providers: [
    RedisService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiCallInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppApiModule {}
