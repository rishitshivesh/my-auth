import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantAllowedOrigins1790000000000 implements MigrationInterface {
  name = 'AddTenantAllowedOrigins1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "allowed_origins" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "allowed_origins"`,
    );
  }
}
