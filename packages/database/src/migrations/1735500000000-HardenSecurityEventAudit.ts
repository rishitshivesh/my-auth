import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * HardenSecurityEventAudit
 *
 * 1. Adds actor_email, application_id, resource_id, resource_type columns.
 * 2. Changes security_events.tenant_id FK from ON DELETE CASCADE → ON DELETE SET NULL
 *    so audit records survive tenant deletion (compliance requirement).
 * 3. Adds a soft FK to oauth_clients for application_id (ON DELETE SET NULL).
 */
export class HardenSecurityEventAudit1735500000000
  implements MigrationInterface
{
  name = "HardenSecurityEventAudit1735500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS template; SET search_path TO template, public, extensions;`);
    console.log("🔒 HardenSecurityEventAudit: starting migration…");

    // ── 1. New audit columns ──────────────────────────────────────────────

    await queryRunner.query(`
      ALTER TABLE security_events
        ADD COLUMN IF NOT EXISTS actor_email    VARCHAR(255),
        ADD COLUMN IF NOT EXISTS application_id UUID,
        ADD COLUMN IF NOT EXISTS resource_id    VARCHAR(255),
        ADD COLUMN IF NOT EXISTS resource_type  VARCHAR(50);
    `);

    console.log(
      "  ✅ Added actor_email, application_id, resource_id, resource_type",
    );

    // ── 2. Change tenant_id FK: CASCADE → SET NULL ────────────────────────
    //
    // We need to:
    //  a) Find the existing FK constraint name (it may vary per installation).
    //  b) Drop it.
    //  c) Recreate it with ON DELETE SET NULL.

    const fkRows: Array<{ constraint_name: string }> = await queryRunner.query(`
        SELECT tc.constraint_name
        FROM   information_schema.table_constraints    tc
        JOIN   information_schema.key_column_usage     kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema   = kcu.table_schema
        JOIN   information_schema.referential_constraints rc
               ON tc.constraint_name = rc.constraint_name
               AND tc.table_schema   = rc.constraint_schema
        WHERE  tc.constraint_type = 'FOREIGN KEY'
          AND  tc.table_name      = 'security_events'
          AND  kcu.column_name    = 'tenant_id';
      `);

    if (fkRows.length > 0) {
      const fkName = fkRows[0]?.constraint_name;
      console.log(`  ⚙️  Dropping existing tenant_id FK: ${fkName}`);
      await queryRunner.query(
        `ALTER TABLE security_events DROP CONSTRAINT "${fkName}";`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE security_events
        ADD CONSTRAINT fk_security_events_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE SET NULL;
    `);

    console.log("  ✅ tenant_id FK changed to ON DELETE SET NULL");

    // ── 3. application_id FK → oauth_clients (ON DELETE SET NULL) ─────────

    const oauthTableExists: Array<{ to_regclass: string | null }> =
      await queryRunner.query(
        `SELECT to_regclass('oauth_clients') AS to_regclass;`,
      );

    if (oauthTableExists[0]?.to_regclass) {
      await queryRunner.query(`
        ALTER TABLE security_events
          ADD CONSTRAINT fk_security_events_application_id
          FOREIGN KEY (application_id)
          REFERENCES oauth_clients(id)
          ON DELETE SET NULL;
      `);
      console.log("  ✅ application_id FK → oauth_clients added");
    } else {
      console.log(
        "  ℹ️  oauth_clients table not found — application_id left as plain UUID column",
      );
    }

    // ── 4. Helpful indexes ────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_actor_email
        ON security_events(actor_email)
        WHERE actor_email IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_application_id
        ON security_events(application_id)
        WHERE application_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_resource
        ON security_events(resource_type, resource_id)
        WHERE resource_type IS NOT NULL;
    `);

    console.log("  ✅ Indexes added");
    console.log("🎉 HardenSecurityEventAudit migration complete");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO template, public, extensions;`);
    console.log("⏪ HardenSecurityEventAudit: reverting migration…");

    // Drop indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_security_events_actor_email;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_security_events_application_id;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_security_events_resource;`,
    );

    // Drop application_id FK if it exists
    await queryRunner.query(`
      ALTER TABLE security_events
        DROP CONSTRAINT IF EXISTS fk_security_events_application_id;
    `);

    // Revert tenant_id FK back to CASCADE
    await queryRunner.query(`
      ALTER TABLE security_events
        DROP CONSTRAINT IF EXISTS fk_security_events_tenant_id;
    `);

    await queryRunner.query(`
      ALTER TABLE security_events
        ADD CONSTRAINT fk_security_events_tenant_id
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE;
    `);

    // Drop new columns
    await queryRunner.query(`
      ALTER TABLE security_events
        DROP COLUMN IF EXISTS actor_email,
        DROP COLUMN IF EXISTS application_id,
        DROP COLUMN IF EXISTS resource_id,
        DROP COLUMN IF EXISTS resource_type;
    `);

    console.log("✅ HardenSecurityEventAudit reverted");
  }
}
