import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Tenant } from "@repo/database";
import { TenantContextService } from "./tenant-context.service";
import { tenantSchemaName } from "@/core/tenant/tenant-schema-name";

export interface TenantJobTarget {
  id: string;
  slug: string;
  name: string;
}

export interface TenantJobSummary {
  /** False when another replica held the job lock and this run was skipped. */
  ran: boolean;
  tenantsProcessed: number;
  tenantsFailed: number;
}

/**
 * Runs work for tenants OUTSIDE an HTTP request (cron jobs, queues, scripts).
 *
 * Request code gets tenant isolation from TenantSchemaMiddleware. Background
 * code has no request, so before this existed jobs silently ran against the
 * `public` schema, where tenant tables do not exist. This runner gives each
 * unit of work the same environment a request gets: a dedicated QueryRunner
 * with search_path set to the tenant schema, published through
 * TenantContextService so TenantAwareRepository and the DataSource proxy
 * pick it up.
 */
@Injectable()
export class TenantJobRunner {
  private readonly logger = new Logger(TenantJobRunner.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Execute `work` with the tenant schema active for every repository call. */
  async runInTenant<T>(tenantSlug: string, work: () => Promise<T>): Promise<T> {
    const schemaName = tenantSchemaName(tenantSlug);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query(`SET search_path TO "${schemaName}", public`);
      return await this.tenantContext.run({ queryRunner, schemaName }, work);
    } finally {
      try {
        await queryRunner.query("SET search_path TO public");
      } catch {
        // connection is being released regardless
      }
      await queryRunner.release();
    }
  }

  /**
   * Run `work` once per active tenant, each inside its own tenant context.
   * A failure in one tenant is logged and does not stop the others.
   *
   * `jobName` also names a cluster-wide Postgres advisory lock, so when
   * several replicas fire the same cron only one of them does the work.
   */
  async forEachActiveTenant(
    jobName: string,
    work: (tenant: TenantJobTarget) => Promise<void>,
  ): Promise<TenantJobSummary> {
    return this.withJobLock(jobName, async () => {
      const tenants = await this.dataSource.manager.find(Tenant, {
        where: { active: true },
        select: { id: true, slug: true, name: true },
      });

      let tenantsFailed = 0;
      for (const tenant of tenants) {
        try {
          await this.runInTenant(tenant.slug, () => work(tenant));
        } catch (error: unknown) {
          tenantsFailed += 1;
          this.logger.error(
            {
              jobName,
              tenantId: tenant.id,
              error: error instanceof Error ? error.message : String(error),
            },
            "Tenant job failed",
          );
        }
      }

      return { ran: true, tenantsProcessed: tenants.length, tenantsFailed };
    });
  }

  private async withJobLock(
    jobName: string,
    body: () => Promise<TenantJobSummary>,
  ): Promise<TenantJobSummary> {
    const lockRunner = this.dataSource.createQueryRunner();
    await lockRunner.connect();
    try {
      const rows: Array<{ locked: boolean }> = await lockRunner.query(
        "SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS locked",
        [`job:${jobName}`],
      );
      if (!rows[0]?.locked) {
        this.logger.debug({ jobName }, "Job already running on another replica — skipped");
        return { ran: false, tenantsProcessed: 0, tenantsFailed: 0 };
      }
      try {
        return await body();
      } finally {
        await lockRunner.query("SELECT pg_advisory_unlock(hashtext($1)::bigint)", [
          `job:${jobName}`,
        ]);
      }
    } finally {
      await lockRunner.release();
    }
  }
}
