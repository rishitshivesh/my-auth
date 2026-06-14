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
    await this.dataSource.query(
      `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
    );
    logger.info({ schemaName, tenantSlug }, "Tenant schema created");
  }

  async schemaExists(tenantSlug: string): Promise<boolean> {
    const schemaName = this.getSchemaName(tenantSlug);
    const result = await this.dataSource.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [schemaName],
    );
    return result.length > 0;
  }
}
