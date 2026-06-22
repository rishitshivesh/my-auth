import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantMfaPolicy1930000000000 implements MigrationInterface {
  name = 'AddTenantMfaPolicy1930000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.tenant_mfa_policy (
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
        ON public.tenant_mfa_policy (tenant_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.tenant_mfa_policy`);
  }
}
