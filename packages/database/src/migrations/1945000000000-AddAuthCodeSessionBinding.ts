import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Binds OAuth authorization codes to the browser session that authorised them
 * (sid) and records when/how that session authenticated (auth_time, amr), so
 * the ID token can carry sid/auth_time/acr/amr and end_session can revoke it.
 *
 * Per-tenant table: altered in the `template` schema (cloned into new tenants
 * by TenantSchemaService) and in every existing fk_* schema.
 */
export class AddAuthCodeSessionBinding1945000000000 implements MigrationInterface {
  name = "AddAuthCodeSessionBinding1945000000000";

  private async schemas(queryRunner: QueryRunner): Promise<string[]> {
    const rows = (await queryRunner.query(
      `SELECT schema_name FROM information_schema.schemata
        WHERE schema_name = 'template' OR schema_name LIKE 'fk\\_%' ESCAPE '\\'`,
    )) as Array<{ schema_name: string }>;
    return rows.map((r) => `"${r.schema_name.replace(/"/g, '""')}"`);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const schema of await this.schemas(queryRunner)) {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS ${schema}."oauth_authorization_codes"
           ADD COLUMN IF NOT EXISTS "session_id" uuid,
           ADD COLUMN IF NOT EXISTS "auth_time" timestamptz,
           ADD COLUMN IF NOT EXISTS "amr" varchar(255)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const schema of await this.schemas(queryRunner)) {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS ${schema}."oauth_authorization_codes"
           DROP COLUMN IF EXISTS "session_id",
           DROP COLUMN IF EXISTS "auth_time",
           DROP COLUMN IF EXISTS "amr"`,
      );
    }
  }
}
