import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { logger } from "@/common/logger";
import { tenantSchemaName } from "./tenant-schema-name";

@Injectable()
export class TenantSchemaService {
  // In-process cache: once a schema + tables are verified, they won't disappear.
  // Eliminates the 2 information_schema queries per request after first access.
  private readonly verifiedSchemas = new Set<string>();

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  getSchemaName(tenantSlug: string): string {
    return tenantSchemaName(tenantSlug);
  }

  /**
   * Returns true if the schema exists AND the sessions table is present.
   * Cached in-process after first confirmation — schemas don't disappear.
   */
  async isVerifiedAndReady(tenantSlug: string): Promise<boolean> {
    const schemaName = this.getSchemaName(tenantSlug);
    if (this.verifiedSchemas.has(schemaName)) return true;

    const result = await this.dataSource.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'sessions' LIMIT 1`,
      [schemaName],
    );

    const ready = (result as unknown[]).length > 0;
    if (ready) this.verifiedSchemas.add(schemaName);
    return ready;
  }

  /** Call after creating a schema so subsequent requests skip the DB check. */
  markVerified(tenantSlug: string): void {
    this.verifiedSchemas.add(this.getSchemaName(tenantSlug));
  }

  async createSchema(tenantSlug: string): Promise<void> {
    const schemaName = this.getSchemaName(tenantSlug);

    // Fast path: already verified in this process.
    if (this.verifiedSchemas.has(schemaName)) return;

    // Advisory lock serializes concurrent schema initialization for the same tenant
    // across all pods/processes. Uses a dedicated connection so the lock is always
    // released even if the caller's connection is unhealthy.
    const lockQr = this.dataSource.createQueryRunner();
    await lockQr.connect();
    try {
      await lockQr.query(`SELECT pg_advisory_lock(hashtext($1)::bigint)`, [
        `schema_init:${schemaName}`,
      ]);

      // Re-check after acquiring lock — another pod may have finished while we waited.
      if (this.verifiedSchemas.has(schemaName)) return;

      await this.dataSource.query(
        `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
      );
      logger.info({ schemaName, tenantSlug }, "Tenant schema created");

      const tables = [
        "users",
        "sessions",
        "roles",
        "permissions",
        "user_roles",
        "role_permissions",
        "mfa_settings",
        "webauthn_credentials",
        "security_events",
        "oauth_clients",
        "oauth_authorization_codes",
        "oauth_access_tokens",
        "oauth_refresh_tokens",
        "oauth_consents",
        "tenant_branding",
        "tenant_social_providers",
        "social_link_requests",
        "policies",
        "groups",
        "user_groups",
        "group_policies",
        "user_policies",
        "role_policies",
        "user_social_connections",
        "user_invites",
        "webhook_endpoints",
        "webhook_deliveries",
        "saml_service_providers",
        "scim_tokens",
        "ldap_connections",
        "tenant_mfa_policy",
      ];

      for (const table of tables) {
        try {
          await this.dataSource.query(
            `CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}" (LIKE template."${table}" INCLUDING ALL)`,
          );
        } catch (err) {
          logger.error({ err, table, schemaName }, "Failed to create table in tenant schema");
          throw err;
        }
      }

      await this.recreateForeignKeys(schemaName);

      this.verifiedSchemas.add(schemaName);
      logger.info({ schemaName }, "Tenant schema tables and foreign keys initialized successfully");
    } finally {
      try {
        await lockQr.query(`SELECT pg_advisory_unlock(hashtext($1)::bigint)`, [
          `schema_init:${schemaName}`,
        ]);
      } catch {}
      await lockQr.release();
    }
  }

  private async recreateForeignKeys(schemaName: string): Promise<void> {
    interface ForeignKeyRow {
      table_name: string;
      column_name: string;
      foreign_table_schema: string;
      foreign_table_name: string;
      foreign_column_name: string;
      constraint_name: string;
      update_rule: string;
      delete_rule: string;
    }

    const fkeys = (await this.dataSource.query(`
      SELECT
          tc.table_name,
          kcu.column_name,
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name  AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          tc.constraint_name,
          rc.update_rule,
          rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema    = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name  = tc.constraint_name
       AND ccu.constraint_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name  = tc.constraint_name
       AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema    = 'template'
    `)) as ForeignKeyRow[];

    const existingNames = new Set(
      (
        (await this.dataSource.query(
          `SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = $1`,
          [schemaName],
        )) as Array<{ constraint_name: string }>
      ).map((c) => c.constraint_name),
    );

    for (const fk of fkeys) {
      if (existingNames.has(fk.constraint_name)) continue;

      const targetSchema =
        fk.foreign_table_schema === "template" ? schemaName : fk.foreign_table_schema;

      const addFkQuery = `
        ALTER TABLE "${schemaName}"."${fk.table_name}"
        ADD CONSTRAINT "${fk.constraint_name}"
        FOREIGN KEY ("${fk.column_name}")
        REFERENCES "${targetSchema}"."${fk.foreign_table_name}" ("${fk.foreign_column_name}")
        ON UPDATE ${fk.update_rule}
        ON DELETE ${fk.delete_rule}
      `;
      try {
        await this.dataSource.query(addFkQuery);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Concurrent initialization may have already added this constraint.
        if (msg.includes("already exists")) continue;
        logger.error({ err, addFkQuery }, "Failed to recreate foreign key constraint in tenant schema");
        throw err;
      }
    }
  }

  // Kept for backwards compatibility — prefer isVerifiedAndReady() in hot paths.
  async schemaExists(tenantSlug: string): Promise<boolean> {
    const schemaName = this.getSchemaName(tenantSlug);
    if (this.verifiedSchemas.has(schemaName)) return true;
    const result = await this.dataSource.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [schemaName],
    );
    return (result as unknown[]).length > 0;
  }

  async tablesExist(tenantSlug: string): Promise<boolean> {
    const schemaName = this.getSchemaName(tenantSlug);
    if (this.verifiedSchemas.has(schemaName)) return true;
    const result = await this.dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'sessions'`,
      [schemaName],
    );
    return (result as unknown[]).length > 0;
  }
}
