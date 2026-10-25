import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { HealthCheckModule } from "../health-check/health-check.module";
import { validationSchema } from "@/config/env.validation";
import { CacheModule } from "@nestjs/cache-manager";
import * as redisStore from "cache-manager-redis-store";
import { TenantResolverMiddleware } from "@/common/midllewares/tenant-resolver.middleware";
import { TenantSchemaMiddleware } from "@/common/midllewares/tenant-schema.middleware";
import { TenantModule } from "@/modules/tenant/tenant.module";
import { DatabaseModule } from "@/core/database/database.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Nest gives precedence to the FIRST file that defines a variable, so
      // the app-local .env wins over the monorepo-root .env.
      envFilePath: [".env", "../../.env"],
      validationSchema,
    }),

    // Single TypeORM root connection (global). Must be registered before any
    // module that injects repositories.
    DatabaseModule,

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
        password: configService.get("REDIS_PASSWORD") || undefined,
        db: configService.get<number>("REDIS_DB", 0),
        ttl: 300, // 5 minutes default
      }),
    }),

    // BullMQ (webhook delivery queue)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get("REDIS_HOST", "localhost"),
          port: configService.get<number>("REDIS_PORT", 6379),
          password: configService.get("REDIS_PASSWORD") || undefined,
          db: configService.get<number>("REDIS_DB", 0),
        },
      }),
    }),
  ],
})
export class GlobalModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Routes that operate without a tenant context.
    // Both middleware layers share these exclusions so they stay in sync.
    const platformRoutes = [
      { path: "health", method: RequestMethod.GET },
      { path: "health/(.*)", method: RequestMethod.GET },
      { path: ".well-known/(.*)", method: RequestMethod.GET },
      // Superadmin / first-run setup — operates on the public schema, no tenant
      { path: "superadmin/(.*)", method: RequestMethod.ALL },
      // Self-service tenant registration — no tenant exists for these requests
      { path: "tenants/register", method: RequestMethod.POST },
      { path: "tenants/slug-check", method: RequestMethod.GET },
      // SAML IdP metadata: tenant slug comes from the path, not the request host/header
      { path: "saml/metadata/(.*)", method: RequestMethod.GET },
    ];

    // Layer 1: resolve tenant from hostname/header → req.tenant
    consumer
      .apply(TenantResolverMiddleware)
      .exclude(...platformRoutes)
      .forRoutes("*");

    // Layer 2: set PostgreSQL search_path → AsyncLocalStorage context
    // Must run AFTER TenantResolverMiddleware so req.tenant is populated
    consumer
      .apply(TenantSchemaMiddleware)
      .exclude(...platformRoutes)
      .forRoutes("*");
  }
}
