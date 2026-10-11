import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { GlobalModule } from "./global";
import { StatsModule } from "./stats/stats.module";
import { DatabaseModule } from "@/core/database/database.module";
import { CombinedModules } from "@/modules";
import { ApiCallInterceptor } from "@/common/interceptors/api-call.interceptor";
import { SharedServicesModule } from "@/core/shared/shared-services.module";
import { RateLimitGuard } from "@/common/guards/rate-limit.guard";

@Module({
  imports: [GlobalModule, SharedServicesModule, StatsModule, DatabaseModule, CombinedModules],
  providers: [
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
