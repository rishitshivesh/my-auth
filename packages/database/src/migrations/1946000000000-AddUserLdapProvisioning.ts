import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Tracks which users an LDAP connection provisioned (ldap_connection_id) and
 * which of them a sync deactivated because they left the directory
 * (ldap_deactivated_at), so a later sync only deactivates / reactivates its
 * own users and never touches locally created or manually disabled accounts.
 *
 * `users` is a per-tenant table: altered in the `template` schema (cloned into
 * new tenants) and in every existing fk_* schema.
 */
export class AddUserLdapProvisioning1946000000000 implements MigrationInterface {
  name = "AddUserLdapProvisioning1946000000000";

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
        `ALTER TABLE IF EXISTS ${schema}."users"
           ADD COLUMN IF NOT EXISTS "ldap_connection_id" uuid,
           ADD COLUMN IF NOT EXISTS "ldap_deactivated_at" timestamptz`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const schema of await this.schemas(queryRunner)) {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS ${schema}."users"
           DROP COLUMN IF EXISTS "ldap_connection_id",
           DROP COLUMN IF EXISTS "ldap_deactivated_at"`,
      );
    }
  }
}
