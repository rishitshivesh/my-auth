import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Removes every foreign key from a tenant-schema table (template + each fk_* schema) to
 * public.tenants. With hundreds of schemas those FKs make `DELETE FROM tenants` lock
 * thousands of relations and fail with "out of shared memory" (see ADR 0005).
 *
 * The tenant_id columns stay (defence-in-depth filters, AGENTS.md section 3); only the
 * constraint goes. Tenant deletion now drops the schema explicitly.
 *
 * Idempotent (re-running finds nothing to drop). Runs outside the executor's transaction
 * so each schema can be committed on its own: a failure leaves finished schemas done and
 * the rest to be picked up by the next run.
 */
interface TenantFk {
  schema_name: string;
  table_name: string;
  constraint_name: string;
}

const quote = (id: string): string => `"${id.replace(/"/g, '""')}"`;

export class DropTenantSchemaForeignKeysToTenants1948000000000 implements MigrationInterface {
  name = "DropTenantSchemaForeignKeysToTenants1948000000000";
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const fks = (await queryRunner.query(
      `SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname AS constraint_name
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'f'
          AND con.confrelid = to_regclass('public.tenants')
          AND (n.nspname = 'template' OR n.nspname LIKE 'fk\\_%' ESCAPE '\\')
        ORDER BY n.nspname, c.relname, con.conname`,
    )) as TenantFk[];

    const bySchema = new Map<string, TenantFk[]>();
    for (const fk of fks) {
      bySchema.set(fk.schema_name, [...(bySchema.get(fk.schema_name) ?? []), fk]);
    }

    for (const [schema, rows] of bySchema) {
      // The executor ran us without a transaction, so this one is ours alone.
      const ownTransaction = !queryRunner.isTransactionActive;
      if (ownTransaction) await queryRunner.startTransaction();
      try {
        for (const fk of rows) {
          await queryRunner.query(
            `ALTER TABLE IF EXISTS ${quote(schema)}.${quote(fk.table_name)} DROP CONSTRAINT IF EXISTS ${quote(fk.constraint_name)}`,
          );
        }
        if (ownTransaction) await queryRunner.commitTransaction();
      } catch (err) {
        if (ownTransaction) await queryRunner.rollbackTransaction();
        throw err;
      }
    }
  }

  public async down(): Promise<void> {
    // Intentionally not restored: the constraints are the defect this migration removes.
  }
}
