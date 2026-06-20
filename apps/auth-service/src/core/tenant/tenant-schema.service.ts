import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { logger } from "@/common/logger";

@Injectable()
export class TenantSchemaService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  getSchemaName(tenantSlug: string): string {
    return `fk_${tenantSlug.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
  }

  async createSchema(tenantSlug: string): Promise<void> {
    const schemaName = this.getSchemaName(tenantSlug);
    
    // 1. Create schema
    await this.dataSource.query(
      `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
    );
    logger.info({ schemaName, tenantSlug }, "Tenant schema created");

    // 2. Clone tenant-specific tables from the public schema
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
      "user_social_connections"
    ];

    for (const table of tables) {
      try {
        await this.dataSource.query(
          `CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}" (LIKE public."${table}" INCLUDING ALL)`
        );
      } catch (err) {
        logger.error({ err, table, schemaName }, "Failed to create table in tenant schema");
        throw err;
      }
    }
    logger.info({ schemaName }, "Tenant schema tables initialized successfully");
  }

  async schemaExists(tenantSlug: string): Promise<boolean> {
    const schemaName = this.getSchemaName(tenantSlug);
    const result = await this.dataSource.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [schemaName],
    );
    return result.length > 0;
  }

  async tablesExist(tenantSlug: string): Promise<boolean> {
    const schemaName = this.getSchemaName(tenantSlug);
    const result = await this.dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'sessions'`,
      [schemaName],
    );
    return result.length > 0;
  }
}
