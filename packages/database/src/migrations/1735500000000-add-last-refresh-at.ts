import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastRefreshAt1735500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS template; SET search_path TO template, public, extensions;`);
    // Add last_refresh_at column
    await queryRunner.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS last_refresh_at TIMESTAMP WITH TIME ZONE;
    `);

    // Add index on refresh_token_family_id for faster family revocation
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_family_id 
      ON sessions(refresh_token_family_id) 
      WHERE revoked_at IS NULL;
    `);

    console.log("✅ Added last_refresh_at column and family index");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO template, public, extensions;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sessions_family_id;`);
    await queryRunner.query(
      `ALTER TABLE sessions DROP COLUMN IF EXISTS last_refresh_at;`,
    );
  }
}
