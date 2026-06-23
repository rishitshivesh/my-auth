import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Moves all per-tenant tables from the `public` schema into the `template` schema.
 *
 * On a fresh database (all migrations run in order), the initial migration already
 * creates these tables in `template`, so this migration is a no-op.
 *
 * On an existing database (migrations were applied before the template-schema
 * refactor), tables still sit in `public`. This migration moves them and removes
 * the intra-tenant FK constraints beforehand (they are re-created per-tenant by
 * TenantSchemaService.createSchema() using the template as blueprint).
 *
 * Cross-schema FKs (e.g. template.users → public.tenants) survive the move
 * because PostgreSQL tracks them by OID, not by schema name.
 */

const TENANT_TABLES = [
  "users",
  "sessions",
  "mfa_settings",
  "security_events",
  "permissions",
  "roles",
  "role_permissions",
  "user_roles",
  "oauth_clients",
  "oauth_authorization_codes",
  "oauth_access_tokens",
  "oauth_refresh_tokens",
  "oauth_consents",
  "webauthn_credentials",
  "tenant_branding",
  "tenant_social_providers",
  "social_link_requests",
  "policies",
  "groups",
  "user_groups",
  "group_policies",
  "user_policies",
  "role_policies",
  "user_social_connections",
  "user_invites",
  "webhook_endpoints",
  "webhook_deliveries",
  "saml_service_providers",
  "scim_tokens",
  "ldap_connections",
  "tenant_mfa_policy",
];

export class MoveToTemplateSchema1935000000000 implements MigrationInterface {
  name = "MoveToTemplateSchema1935000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "template"`);

    // Find which of the tenant tables still live in public (existing-DB scenario).
    const placeholders = TENANT_TABLES.map((_, i) => `$${i + 1}`).join(", ");
    const rows = (await queryRunner.query(
      `SELECT table_name::text
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type  = 'BASE TABLE'
         AND table_name  IN (${placeholders})`,
      TENANT_TABLES,
    )) as Array<{ table_name: string }>;

    const toMove = rows.map((r) => r.table_name);
    if (toMove.length === 0) {
      // Fresh database — tables were created in template directly.
      return;
    }

    // Drop all intra-tenant FK constraints that would block ALTER TABLE SET SCHEMA.
    // Cross-schema FKs (→ public.tenants) are preserved automatically.
    const fkPlaceholders = toMove.map((_, i) => `$${i + 1}`).join(", ");
    const fks = (await queryRunner.query(
      `SELECT table_name::text, constraint_name::text
       FROM information_schema.table_constraints
       WHERE constraint_type = 'FOREIGN KEY'
         AND table_schema   = 'public'
         AND table_name     IN (${fkPlaceholders})`,
      toMove,
    )) as Array<{ table_name: string; constraint_name: string }>;

    for (const { table_name, constraint_name } of fks) {
      await queryRunner.query(
        `ALTER TABLE public."${table_name}" DROP CONSTRAINT IF EXISTS "${constraint_name}"`,
      );
    }

    // Move each table to the template schema.
    // Tables already in template are skipped (idempotent).
    for (const table of toMove) {
      const [{ exists }] = (await queryRunner.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'template' AND table_name = $1
         ) AS exists`,
        [table],
      )) as Array<{ exists: boolean }>;

      if (!exists) {
        await queryRunner.query(`ALTER TABLE public."${table}" SET SCHEMA template`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Move tables back to public for a clean rollback.
    for (const table of TENANT_TABLES) {
      const [{ exists }] = (await queryRunner.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'template' AND table_name = $1
         ) AS exists`,
        [table],
      )) as Array<{ exists: boolean }>;

      if (exists) {
        await queryRunner.query(`ALTER TABLE template."${table}" SET SCHEMA public`);
      }
    }

    await queryRunner.query(`DROP SCHEMA IF EXISTS "template"`);
  }
}
