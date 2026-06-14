#!/usr/bin/env ts-node

/**
 * Schema-per-tenant migration script
 *
 * Usage:
 *   ts-node scripts/migrate-to-schema-per-tenant.ts [--dry-run] [--tenant=slug]
 *   ts-node scripts/migrate-to-schema-per-tenant.ts --rollback --tenant=slug
 *   ts-node scripts/migrate-to-schema-per-tenant.ts --cleanup --tenant=slug --confirm
 */

import { DataSource } from 'typeorm';

const TABLES_IN_ORDER = [
  'users',
  'sessions',
  'refresh_tokens',
  'password_history',
  'mfa_configs',
  'backup_codes',
  'webauthn_credentials',
  'user_invites',
  'oauth_clients',
  'oauth_tokens',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'groups',
  'user_groups',
  'group_policies',
  'policies',
  'role_policies',
  'user_policies',
  'audit_logs',
  'security_events',
];

interface MigrationArgs {
  dryRun: boolean;
  tenantSlug: string | null;
  rollback: boolean;
  cleanup: boolean;
  confirm: boolean;
}

function parseArgs(): MigrationArgs {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    tenantSlug: args.find(a => a.startsWith('--tenant='))?.split('=')[1] ?? null,
    rollback: args.includes('--rollback'),
    cleanup: args.includes('--cleanup'),
    confirm: args.includes('--confirm'),
  };
}

function getSchemaName(slug: string): string {
  return `fk_${slug.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  process.stdout.write(`[${ts}] ${msg}\n`);
}

async function createDataSource(): Promise<DataSource> {
  const dbUrl = process.env.DB_URL ?? process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DB_URL or DATABASE_URL environment variable is required');
  }

  const ds = new DataSource({
    type: 'postgres',
    url: dbUrl,
    logging: false,
  });

  await ds.initialize();
  return ds;
}

async function getTenants(
  ds: DataSource,
  tenantSlug: string | null,
): Promise<Array<{ id: string; slug: string; migratedAt: Date | null }>> {
  let query = 'SELECT id, slug, migrated_at as "migratedAt" FROM public.tenants';
  const params: string[] = [];

  if (tenantSlug) {
    query += ' WHERE slug = $1';
    params.push(tenantSlug);
  }

  query += ' ORDER BY slug';
  return ds.query(query, params);
}

async function ensureMigratedAtColumn(ds: DataSource, dryRun: boolean): Promise<void> {
  const columns = await ds.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'migrated_at'`,
  );

  if (columns.length === 0) {
    log('Adding migrated_at column to tenants table');
    if (!dryRun) {
      await ds.query('ALTER TABLE public.tenants ADD COLUMN migrated_at TIMESTAMP WITH TIME ZONE');
    }
  }
}

async function schemaExists(ds: DataSource, schemaName: string): Promise<boolean> {
  const result = await ds.query(
    'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
    [schemaName],
  );
  return result.length > 0;
}

async function tableExistsInSchema(ds: DataSource, schemaName: string, tableName: string): Promise<boolean> {
  const result = await ds.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2',
    [schemaName, tableName],
  );
  return result.length > 0;
}

async function getRowCount(ds: DataSource, schema: string, table: string, tenantId?: string): Promise<number> {
  const fullTable = `"${schema}"."${table}"`;
  let query = `SELECT count(*)::int as count FROM ${fullTable}`;
  const params: string[] = [];

  if (tenantId) {
    const hasCol = await ds.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = 'tenant_id'`,
      [schema, table],
    );
    if (hasCol.length > 0) {
      query += ' WHERE tenant_id = $1';
      params.push(tenantId);
    }
  }

  const result = await ds.query(query, params);
  return result[0]?.count ?? 0;
}

async function migrateTenant(
  ds: DataSource,
  tenant: { id: string; slug: string; migratedAt: Date | null },
  dryRun: boolean,
): Promise<void> {
  const schemaName = getSchemaName(tenant.slug);
  const startTime = Date.now();

  if (tenant.migratedAt) {
    log(`  SKIP: Tenant "${tenant.slug}" already migrated at ${tenant.migratedAt}`);
    return;
  }

  log(`  Migrating tenant "${tenant.slug}" → schema "${schemaName}"`);

  const queryRunner = ds.createQueryRunner();
  await queryRunner.connect();

  try {
    if (!dryRun) {
      await queryRunner.startTransaction();
    }

    // Step 1: Create schema if needed
    const exists = await schemaExists(ds, schemaName);
    if (!exists) {
      log(`    Creating schema "${schemaName}"`);
      if (!dryRun) {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
      }
    }

    let totalRows = 0;
    let tablesMigrated = 0;

    // Step 2-4: Migrate each table
    for (const table of TABLES_IN_ORDER) {
      const sourceExists = await tableExistsInSchema(ds, 'public', table);
      if (!sourceExists) {
        continue;
      }

      const sourceCount = await getRowCount(ds, 'public', table, tenant.id);
      if (sourceCount === 0) {
        continue;
      }

      // Create target table if not exists (copy structure)
      const targetExists = await tableExistsInSchema(ds, schemaName, table);
      if (!targetExists) {
        log(`    Creating table "${schemaName}"."${table}"`);
        if (!dryRun) {
          await queryRunner.query(
            `CREATE TABLE "${schemaName}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
          );
        }
      }

      // Check if already has data (idempotent)
      const targetCount = dryRun ? 0 : await getRowCount(ds, schemaName, table);
      if (targetCount > 0) {
        log(`    SKIP "${table}": already has ${targetCount} rows in target schema`);
        continue;
      }

      // Check if table has tenant_id column
      const hasTenantCol = await ds.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id'`,
        [table],
      );

      log(`    Migrating "${table}": ${sourceCount} rows`);
      if (!dryRun) {
        if (hasTenantCol.length > 0) {
          await queryRunner.query(
            `INSERT INTO "${schemaName}"."${table}" SELECT * FROM public."${table}" WHERE tenant_id = $1`,
            [tenant.id],
          );
        } else {
          await queryRunner.query(
            `INSERT INTO "${schemaName}"."${table}" SELECT * FROM public."${table}"`,
          );
        }

        // Verify
        const verifyCount = await getRowCount(ds, schemaName, table);
        if (verifyCount !== sourceCount) {
          throw new Error(
            `Verification failed for "${table}": expected ${sourceCount}, got ${verifyCount}`,
          );
        }
      }

      totalRows += sourceCount;
      tablesMigrated++;
    }

    // Step 5: Mark tenant as migrated
    if (!dryRun) {
      await queryRunner.query(
        'UPDATE public.tenants SET migrated_at = NOW() WHERE id = $1',
        [tenant.id],
      );
      await queryRunner.commitTransaction();
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`  ${dryRun ? '[DRY RUN] ' : ''}Tenant "${tenant.slug}": migrated ${totalRows} rows across ${tablesMigrated} tables in ${elapsed}s`);
  } catch (error) {
    if (!dryRun) {
      await queryRunner.rollbackTransaction();
    }
    const message = error instanceof Error ? error.message : String(error);
    log(`  ERROR migrating tenant "${tenant.slug}": ${message}`);
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function rollbackTenant(
  ds: DataSource,
  tenant: { id: string; slug: string },
  dryRun: boolean,
): Promise<void> {
  const schemaName = getSchemaName(tenant.slug);

  const exists = await schemaExists(ds, schemaName);
  if (!exists) {
    log(`  SKIP: Schema "${schemaName}" does not exist`);
    return;
  }

  log(`  Rolling back tenant "${tenant.slug}" from schema "${schemaName}"`);

  if (!dryRun) {
    // Copy data back to public schema
    for (const table of TABLES_IN_ORDER) {
      const sourceExists = await tableExistsInSchema(ds, schemaName, table);
      if (!sourceExists) continue;

      const count = await getRowCount(ds, schemaName, table);
      if (count === 0) continue;

      log(`    Restoring "${table}": ${count} rows`);
      await ds.query(
        `INSERT INTO public."${table}" SELECT * FROM "${schemaName}"."${table}" ON CONFLICT DO NOTHING`,
      );
    }

    // Drop schema
    await ds.query(`DROP SCHEMA "${schemaName}" CASCADE`);

    // Clear migrated_at
    await ds.query(
      'UPDATE public.tenants SET migrated_at = NULL WHERE id = $1',
      [tenant.id],
    );
  }

  log(`  ${dryRun ? '[DRY RUN] ' : ''}Rollback complete for tenant "${tenant.slug}"`);
}

async function cleanupTenant(
  ds: DataSource,
  tenant: { id: string; slug: string },
  dryRun: boolean,
): Promise<void> {
  const schemaName = getSchemaName(tenant.slug);

  const exists = await schemaExists(ds, schemaName);
  if (!exists) {
    log(`  ERROR: Schema "${schemaName}" does not exist. Cannot cleanup.`);
    return;
  }

  log(`  Cleaning up public schema data for tenant "${tenant.slug}"`);

  for (const table of [...TABLES_IN_ORDER].reverse()) {
    const sourceExists = await tableExistsInSchema(ds, 'public', table);
    if (!sourceExists) continue;

    const hasTenantCol = await ds.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id'`,
      [table],
    );
    if (hasTenantCol.length === 0) continue;

    const count = await getRowCount(ds, 'public', table, tenant.id);
    if (count === 0) continue;

    log(`    Deleting ${count} rows from public."${table}"`);
    if (!dryRun) {
      await ds.query(
        `DELETE FROM public."${table}" WHERE tenant_id = $1`,
        [tenant.id],
      );
    }
  }

  log(`  ${dryRun ? '[DRY RUN] ' : ''}Cleanup complete for tenant "${tenant.slug}"`);
}

async function main(): Promise<void> {
  const args = parseArgs();

  log('Schema-per-tenant migration');
  log(`  Mode: ${args.rollback ? 'ROLLBACK' : args.cleanup ? 'CLEANUP' : 'MIGRATE'}${args.dryRun ? ' (DRY RUN)' : ''}`);
  if (args.tenantSlug) {
    log(`  Tenant: ${args.tenantSlug}`);
  }

  if (args.cleanup && !args.confirm) {
    log('ERROR: --cleanup requires --confirm flag (this is irreversible)');
    process.exit(1);
  }

  if ((args.rollback || args.cleanup) && !args.tenantSlug) {
    log('ERROR: --rollback and --cleanup require --tenant=slug');
    process.exit(1);
  }

  const ds = await createDataSource();

  try {
    await ensureMigratedAtColumn(ds, args.dryRun);
    const tenants = await getTenants(ds, args.tenantSlug);

    if (tenants.length === 0) {
      log('No tenants found');
      return;
    }

    log(`Found ${tenants.length} tenant(s) to process`);

    let successCount = 0;
    let errorCount = 0;

    for (const tenant of tenants) {
      try {
        if (args.rollback) {
          await rollbackTenant(ds, tenant, args.dryRun);
        } else if (args.cleanup) {
          await cleanupTenant(ds, tenant, args.dryRun);
        } else {
          await migrateTenant(ds, tenant, args.dryRun);
        }
        successCount++;
      } catch {
        errorCount++;
      }
    }

    log(`\nComplete: ${successCount} succeeded, ${errorCount} failed`);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  log(`Fatal error: ${message}`);
  process.exit(1);
});
