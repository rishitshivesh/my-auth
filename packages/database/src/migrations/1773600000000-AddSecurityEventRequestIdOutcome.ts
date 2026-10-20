import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds request_id (correlation id) and outcome to security_events.
 * Additive and nullable/defaulted only. Runs against the template schema,
 * matching HardenSecurityEventAudit.
 */
export class AddSecurityEventRequestIdOutcome1773600000000
  implements MigrationInterface
{
  name = "AddSecurityEventRequestIdOutcome1773600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE SCHEMA IF NOT EXISTS template; SET search_path TO template, public, extensions;`,
    );
    await queryRunner.query(`
      ALTER TABLE security_events
        ADD COLUMN IF NOT EXISTS request_id VARCHAR(64),
        ADD COLUMN IF NOT EXISTS outcome    VARCHAR(16) NOT NULL DEFAULT 'success';
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_security_events_request_id
        ON security_events(request_id)
        WHERE request_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO template, public, extensions;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_security_events_request_id;`);
    await queryRunner.query(`
      ALTER TABLE security_events
        DROP COLUMN IF EXISTS request_id,
        DROP COLUMN IF EXISTS outcome;
    `);
  }
}
