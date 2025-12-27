import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HealthCheckModule } from "../health-check/health-check.module";
import { validationSchema } from "@/config/env.validation";
import { CacheModule } from "@nestjs/cache-manager";
import * as redisStore from "cache-manager-redis-store";
import { TenantResolverMiddleware } from "@/common/midllewares/tenant-resolver.middleware";
import { TenantModule } from "@/modules/tenant/tenant.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env"],
      validationSchema,
    }),

    HealthCheckModule,
    TenantModule,

    // Cache (Redis)
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get("REDIS_HOST", "localhost"),
        port: configService.get("REDIS_PORT", 6379),
        password: configService.get("REDIS_PASSWORD"),
        ttl: 300, // 5 minutes default
      }),
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        host: configService.get("DATABASE_HOST"),
        port: configService.get("DATABASE_PORT"),
        username: configService.get("DATABASE_USER"),
        password: configService.get("DATABASE_PASSWORD"),
        database: configService.get("DATABASE_NAME"),
        autoLoadEntities: true,
        synchronize: false,
        logging: configService.get("DATABASE_LOGGING") === "true",
        ssl:
          configService.get("DB_SSL") === "true"
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
  ],
})
export class GlobalModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply tenant resolver to ALL routes
    consumer.apply(TenantResolverMiddleware).forRoutes("*");
  }
}
