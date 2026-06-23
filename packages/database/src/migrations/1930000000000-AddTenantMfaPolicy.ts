import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantMfaPolicy1930000000000 implements MigrationInterface {
  name = 'AddTenantMfaPolicy1930000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Per-tenant table — must live in template so TenantSchemaService.createSchema()
    // can clone it into each tenant's fk_{slug} schema via LIKE template.xxx.
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "template"`);
    await queryRunner.query(`SET search_path TO template, public, extensions`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_mfa_policy (
        id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id             UUID        NOT NULL,
        enforce_for_all_users BOOLEAN     NOT NULL DEFAULT false,
        enforce_for_admins    BOOLEAN     NOT NULL DEFAULT false,
        grace_period_days     INTEGER     NOT NULL DEFAULT 0,
        exempt_role_slugs     TEXT        NOT NULL DEFAULT '',
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_mfa_policy_tenant_id"
        ON tenant_mfa_policy (tenant_id)
    `);
    await queryRunner.query(`SET search_path TO public`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO template, public, extensions`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_mfa_policy`);
    await queryRunner.query(`SET search_path TO public`);
  }
}
