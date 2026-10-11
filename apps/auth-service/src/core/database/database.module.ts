import { Module } from "@nestjs/common";
import { TypeOrmModule, TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { dataSourceOptions } from "@repo/database";
import { DataSource, DataSourceOptions, ObjectLiteral, EntityTarget, QueryRunner } from "typeorm";
import { TenantContextService, tenantStorage } from "./tenant-context.service";
import { CorsRefreshService } from "@/core/cors-refresh.service";
import { SessionRepository } from "./session.repository";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService,
      ): TypeOrmModuleOptions | Promise<TypeOrmModuleOptions> => {
        const baseOptions = dataSourceOptions as unknown as Record<string, unknown>;
        return {
          ...baseOptions,
          host: configService.get<string>("DATABASE_HOST"),
          port: configService.get<number>("DATABASE_PORT"),
          username: configService.get<string>("DATABASE_USER"),
          password: configService.get<string>("DATABASE_PASSWORD"),
          database: configService.get<string>("DATABASE_NAME"),
          logging: configService.get<string>("DATABASE_LOGGING") === "true",
          autoLoadEntities: true,
          synchronize: false, // NEVER use in production
        };
      },
      dataSourceFactory: async (options: DataSourceOptions | undefined) => {
        if (!options) {
          throw new Error("No DataSourceOptions provided");
        }
        const dataSource = new DataSource(options);
        await dataSource.initialize();

        const originalGetRepository = dataSource.getRepository.bind(dataSource);

        dataSource.getRepository = <Entity extends ObjectLiteral>(
          target: EntityTarget<Entity>,
        ) => {
          const repo = originalGetRepository(target);
          return new Proxy(repo, {
            get(targetRepo, prop, receiver) {
              if (prop === "manager") {
                const store = tenantStorage.getStore();
                return store?.queryRunner ? store.queryRunner.manager : targetRepo.manager;
              }
              if (prop === "queryRunner") {
                const store = tenantStorage.getStore();
                return store?.queryRunner || targetRepo.queryRunner;
              }
              if (prop === "createQueryBuilder") {
                return (alias?: string, queryRunner?: QueryRunner) => {
                  const store = tenantStorage.getStore();
                  const qr = store?.queryRunner;
                  const manager = qr ? qr.manager : targetRepo.manager;
                  // When alias is omitted, TypeORM defaults to the entity name.
                  // Passing undefined to EntityManager.createQueryBuilder() produces
                  // broken SQL ("FROM table undefined"), so we replicate the default.
                  const effectiveAlias = alias ?? targetRepo.metadata.name;
                  return manager.createQueryBuilder(target, effectiveAlias, queryRunner ?? qr ?? undefined);
                };
              }
              return Reflect.get(targetRepo, prop, receiver);
            },
          }) as typeof repo;
        };

        return dataSource;
      },
    }),
  ],
  providers: [TenantContextService, CorsRefreshService, SessionRepository],
  exports: [TenantContextService, CorsRefreshService, SessionRepository],
})
export class DatabaseModule {}

