import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { dataSourceOptions } from "@repo/database";
import { TenantContextService } from "./tenant-context.service";
import { CorsRefreshService } from "@/core/cors-refresh.service";
import { SessionRepository } from "./session.repository";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        ({
          ...dataSourceOptions,
          host: configService.get("DATABASE_HOST"),
          port: configService.get("DATABASE_PORT"),
          username: configService.get("DATABASE_USER"),
          password: configService.get("DATABASE_PASSWORD"),
          database: configService.get("DATABASE_NAME"),
          logging: configService.get("DATABASE_LOGGING") === "true",
          autoLoadEntities: true,
          synchronize: false, // NEVER use in production
        }) as any,
    }),
  ],
  providers: [TenantContextService, CorsRefreshService, SessionRepository],
  exports: [TenantContextService, CorsRefreshService, SessionRepository],
})
export class DatabaseModule {}
