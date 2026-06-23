import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMfaGraceStartedAt1910000000000 implements MigrationInterface {
  name = "AddMfaGraceStartedAt1910000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS template; SET search_path TO template, public, extensions;`);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "mfa_grace_started_at" TIMESTAMPTZ NULL
    `);

    // Apply to per-tenant schemas as well
    const schemas: { schema_name: string }[] = await queryRunner.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name LIKE 'fk_%'
    `);

    for (const { schema_name } of schemas) {
      await queryRunner.query(`
        ALTER TABLE "${schema_name}"."users"
        ADD COLUMN IF NOT EXISTS "mfa_grace_started_at" TIMESTAMPTZ NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO template, public, extensions;`);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "mfa_grace_started_at"
    `);

    const schemas: { schema_name: string }[] = await queryRunner.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name LIKE 'fk_%'
    `);

    for (const { schema_name } of schemas) {
      await queryRunner.query(`
        ALTER TABLE "${schema_name}"."users"
        DROP COLUMN IF EXISTS "mfa_grace_started_at"
      `);
    }
  }
}
