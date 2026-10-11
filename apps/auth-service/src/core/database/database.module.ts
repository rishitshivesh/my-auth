import { Global, Module } from "@nestjs/common";
import { TypeOrmModule, TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { buildDataSourceOptions } from "@repo/database";
import { DataSource, ObjectLiteral, EntityTarget, QueryRunner } from "typeorm";
import { TenantContextService, tenantStorage } from "./tenant-context.service";
import { CorsRefreshService } from "@/core/cors-refresh.service";
import { SessionRepository } from "./session.repository";

const DATABASE_ENV_KEYS = [
  "DB_URL",
  "DATABASE_URL",
  "DATABASE_HOST",
  "DATABASE_PORT",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
  "DATABASE_NAME",
  "DB_SSL",
  "DATABASE_SSL",
  "DB_SSL_CA",
  "DB_SSL_REJECT_UNAUTHORIZED",
  "DB_LOGGING",
  "DATABASE_LOGGING",
  "DATABASE_POOL_MAX",
  "DATABASE_POOL_MIN",
] as const;

/**
 * DatabaseModule — the ONE TypeORM root connection for the process.
 *
 * @Global so that `SessionRepository`, `TenantContextService` and the
 * tenant-scoping DataSource are visible to every module (guards such as
 * SessionGuard are instantiated in the host module's context, so a
 * non-global DatabaseModule made boot depend on every feature module
 * remembering to import it).
 *
 * The dataSourceFactory wraps getRepository() in a proxy so that every
 * repository call made inside a tenant request runs on the request's
 * QueryRunner (whose search_path points at the tenant schema).
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        // Resolve connection settings from ConfigService (which has loaded
        // .env by now) rather than from module-import-time process.env.
        const env: Record<string, string | undefined> = {};
        for (const key of DATABASE_ENV_KEYS) {
          env[key] = configService.get<string>(key);
        }
        return {
          ...(buildDataSourceOptions(env) as TypeOrmModuleOptions),
          autoLoadEntities: true,
          synchronize: false, // schema changes go through migrations only
        };
      },
      dataSourceFactory: async (options) => {
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

