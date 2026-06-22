import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGuestUserRole1800100000000 implements MigrationInterface {
  name = 'AddGuestUserRole1800100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS template; SET search_path TO template, public, extensions;`);
    // Add to public schema's user_roles (platform-level roles for sentry tenant)
    await queryRunner.query(`
      ALTER TABLE "user_roles"
        ADD COLUMN IF NOT EXISTS "is_guest" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "invited_by" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO template, public, extensions;`);
    await queryRunner.query(`
      ALTER TABLE "user_roles"
        DROP COLUMN IF EXISTS "is_guest",
        DROP COLUMN IF EXISTS "invited_by"
    `);
  }
}
