import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HealthCheckModule } from "../health-check/health-check.module";
import { validationSchema } from "@/config/env.validation";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env"],
      validationSchema,
    }),

    HealthCheckModule,

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const yes = (v?: string, d = false) =>
          v === undefined
            ? d
            : ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
        return {
          type: "postgres",
          url: cfg.get<string>("DB_URL")!,
          ssl: yes(cfg.get<string>("DB_SSL"))
            ? { rejectUnauthorized: false }
            : false,
          logging: yes(cfg.get<string>("DB_LOGGING")),
          autoLoadEntities: true,
          synchronize: false, // we’ll manage schema with migrations
        };
      },
    }),
  ],
})
export class GlobalModule {}
