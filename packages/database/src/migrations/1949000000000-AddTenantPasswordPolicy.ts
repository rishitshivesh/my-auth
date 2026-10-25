import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Per-tenant password policy. A per-tenant table: created in `template` (cloned into new
 * tenants by TenantSchemaService) and in every existing fk_* schema. No FK to public.tenants
 * (ADR 0005); tenant_id is kept as a plain column.
 */
export class AddTenantPasswordPolicy1949000000000 implements MigrationInterface {
  name = "AddTenantPasswordPolicy1949000000000";

  private async schemas(queryRunner: QueryRunner): Promise<string[]> {
    const rows = (await queryRunner.query(
      `SELECT schema_name FROM information_schema.schemata
        WHERE schema_name = 'template' OR schema_name LIKE 'fk\\_%' ESCAPE '\\'`,
    )) as Array<{ schema_name: string }>;
    return rows.map((r) => `"${r.schema_name.replace(/"/g, '""')}"`);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "template"`);
    for (const schema of await this.schemas(queryRunner)) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${schema}."tenant_password_policy" (
          id                             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id                      UUID        NOT NULL,
          min_length                     INTEGER     NOT NULL DEFAULT 12,
          require_common_password_check  BOOLEAN     NOT NULL DEFAULT true,
          history_count                  INTEGER     NOT NULL DEFAULT 5,
          max_age_days                   INTEGER     NOT NULL DEFAULT 0,
          lockout_threshold              INTEGER     NOT NULL DEFAULT 5,
          lockout_duration_minutes       INTEGER     NOT NULL DEFAULT 15,
          updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_password_policy_tenant_id"
           ON ${schema}."tenant_password_policy" (tenant_id)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const schema of await this.schemas(queryRunner)) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${schema}."tenant_password_policy"`);
    }
  }
}
