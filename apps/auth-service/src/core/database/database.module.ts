import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { dataSourceOptions } from "@repo/database";

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
})
export class DatabaseModule {}
