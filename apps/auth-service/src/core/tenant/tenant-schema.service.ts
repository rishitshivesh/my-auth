import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { logger } from "@/common/logger";

@Injectable()
export class TenantSchemaService {
  // In-process cache: once a schema + tables are verified, they won't disappear.
  // Eliminates the 2 information_schema queries per request after first access.
  private readonly verifiedSchemas = new Set<string>();

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  getSchemaName(tenantSlug: string): string {
    return `fk_${tenantSlug.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
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
    ];

    for (const table of tables) {
      try {
        await this.dataSource.query(
          `CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
        );
      } catch (err) {
        logger.error({ err, table, schemaName }, "Failed to create table in tenant schema");
        throw err;
      }
    }

    logger.info({ schemaName }, "Tenant schema tables initialized successfully");
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
