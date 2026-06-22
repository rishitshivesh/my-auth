import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserTenantMemberships1920000000000 implements MigrationInterface {
  name = 'AddUserTenantMemberships1920000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.user_tenant_memberships (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL,
        user_email  TEXT NOT NULL,
        tenant_id   UUID NOT NULL,
        tenant_slug TEXT NOT NULL,
        role_slug   TEXT NOT NULL DEFAULT 'member',
        status      TEXT NOT NULL DEFAULT 'active',
        invited_by  UUID,
        joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, tenant_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_utm_user_email ON public.user_tenant_memberships(user_email)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_utm_tenant_id ON public.user_tenant_memberships(tenant_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.user_tenant_memberships`);
  }
}
