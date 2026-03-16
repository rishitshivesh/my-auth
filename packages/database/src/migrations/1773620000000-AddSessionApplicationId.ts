import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSessionApplicationId1773620000000 implements MigrationInterface {
  name = "AddSessionApplicationId1773620000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD COLUMN IF NOT EXISTS "application_id" uuid NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TABLE "sessions"
        ADD CONSTRAINT "FK_sessions_application_id"
        FOREIGN KEY ("application_id")
        REFERENCES "oauth_clients"("id")
        ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_expires_revoked"
      ON "sessions" ("expires_at")
      WHERE "revoked_at" IS NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sessions_expires_revoked"`);
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "FK_sessions_application_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP COLUMN IF EXISTS "application_id"`,
    );
  }
}
