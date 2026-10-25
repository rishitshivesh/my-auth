import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Persists the authentication methods (OIDC `amr`, space-separated) a session's login
 * completed with, so token refresh and /oauth/authorize report them accurately.
 *
 * `sessions` is a per-tenant table: altered in the `template` schema (cloned into new
 * tenants) and in every existing fk_* schema. Existing sessions keep NULL, which readers
 * treat as a password login.
 */
export class AddSessionAmr1950000000000 implements MigrationInterface {
  name = "AddSessionAmr1950000000000";

  private async schemas(queryRunner: QueryRunner): Promise<string[]> {
    const rows = (await queryRunner.query(
      `SELECT schema_name FROM information_schema.schemata
        WHERE schema_name = 'template' OR schema_name LIKE 'fk\\_%' ESCAPE '\\'`,
    )) as Array<{ schema_name: string }>;
    return rows.map((r) => `"${r.schema_name.replace(/"/g, '""')}"`);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const schema of await this.schemas(queryRunner)) {
      await queryRunner.query(`ALTER TABLE IF EXISTS ${schema}."sessions" ADD COLUMN IF NOT EXISTS "amr" text`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const schema of await this.schemas(queryRunner)) {
      await queryRunner.query(`ALTER TABLE IF EXISTS ${schema}."sessions" DROP COLUMN IF EXISTS "amr"`);
    }
  }
}
