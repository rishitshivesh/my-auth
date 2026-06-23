import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds security-hardening columns to the sessions table:
 *   - access_token_hash   : SHA-256 of the last issued access JWT (never raw token)
 *   - refresh_expires_at  : expiry of the active refresh token (updated on rotation)
 *   - last_used_at        : timestamp set on every successful refresh rotation
 *
 * Also creates a composite index on (expires_at, revoked_at) to accelerate the
 * 15-minute cleanup query:  WHERE expires_at < NOW() AND revoked_at IS NULL
 */
export class AddSessionSecurityFields1780000000000 implements MigrationInterface {
  name = "AddSessionSecurityFields1780000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS template; SET search_path TO template, public, extensions;`);
    // New columns
    await queryRunner.query(`
      ALTER TABLE "sessions"
        ADD COLUMN IF NOT EXISTS "access_token_hash"  VARCHAR(255)              DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "refresh_expires_at" TIMESTAMP WITH TIME ZONE  DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "last_used_at"       TIMESTAMP WITH TIME ZONE  DEFAULT NULL
    `);

    // Composite index for the cleanup query
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_expires_at_revoked_at"
        ON "sessions" ("expires_at", "revoked_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO template, public, extensions;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sessions_expires_at_revoked_at"`,
    );

    await queryRunner.query(`
      ALTER TABLE "sessions"
        DROP COLUMN IF EXISTS "last_used_at",
        DROP COLUMN IF EXISTS "refresh_expires_at",
        DROP COLUMN IF EXISTS "access_token_hash"
    `);
  }
}
