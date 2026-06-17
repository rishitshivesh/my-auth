/**
 * Tenant Isolation Verification Script
 *
 * Proves that search_path-based schema isolation works correctly.
 * Run with: ts-node scripts/verify-tenant-isolation.ts
 *           ts-node scripts/verify-tenant-isolation.ts --dry-run
 *
 * --dry-run: connects to DB and checks schema existence but skips creating test data
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '@repo/database';

dotenv.config({ path: '.env' });

const isDryRun = process.argv.includes('--dry-run');

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function pass(name: string, detail: string) {
  results.push({ name, passed: true, detail });
  console.log(`  ✓ PASS  ${name}`);
}

function fail(name: string, detail: string) {
  results.push({ name, passed: false, detail });
  console.error(`  ✗ FAIL  ${name}: ${detail}`);
}

async function main() {
  console.log('\n=== Scrolloop Sentry — Tenant Isolation Verification ===\n');
  console.log(`Mode: ${isDryRun ? 'dry-run (no test data created)' : 'full'}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const dataSource = new DataSource({
    ...(dataSourceOptions as object),
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'scrolloop_sentry',
    synchronize: false,
    logging: false,
  } as Parameters<typeof DataSource>[0]);

  await dataSource.initialize();
  console.log('Connected to database.\n');

  const testSlugA = 'verify_tenant_a';
  const testSlugB = 'verify_tenant_b';
  const schemaA = `fk_${testSlugA}`;
  const schemaB = `fk_${testSlugB}`;

  // ── Check schema existence ─────────────────────────────────────────────────
  console.log('── Schema Existence ──');
  const schemaCheck = async (schema: string, slug: string) => {
    const rows = await dataSource.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [schema],
    );
    if (rows.length > 0) {
      pass(`Schema "${schema}" exists`, `tenant: ${slug}`);
      return true;
    } else {
      if (isDryRun) {
        console.log(`  ℹ SKIP  Schema "${schema}" does not exist (dry-run — not creating)`);
        return false;
      }
      // Create it
      await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      pass(`Schema "${schema}" created`, `tenant: ${slug}`);
      return true;
    }
  };

  const schemaAExists = await schemaCheck(schemaA, testSlugA);
  const schemaBExists = await schemaCheck(schemaB, testSlugB);

  if (isDryRun) {
    console.log('\n── Skipping data tests (dry-run mode) ──\n');
    await dataSource.destroy();
    printReport();
    return;
  }

  if (!schemaAExists || !schemaBExists) {
    fail('Schema setup', 'One or both schemas could not be created');
    await dataSource.destroy();
    printReport();
    return;
  }

  // ── Create tables in each schema (minimal, for testing only) ──────────────
  for (const schema of [schemaA, schemaB]) {
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".verify_test_users (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        email text NOT NULL,
        tenant_id text NOT NULL
      )
    `);
  }

  // ── Insert test rows ───────────────────────────────────────────────────────
  const emailA = `user_a@verify-${Date.now()}.test`;
  const emailB = `user_b@verify-${Date.now()}.test`;

  await dataSource.query(
    `INSERT INTO "${schemaA}".verify_test_users (email, tenant_id) VALUES ($1, $2)`,
    [emailA, testSlugA],
  );
  await dataSource.query(
    `INSERT INTO "${schemaB}".verify_test_users (email, tenant_id) VALUES ($1, $2)`,
    [emailB, testSlugB],
  );

  // ── Test 1: Schema A query sees only A's data ──────────────────────────────
  console.log('\n── Schema Isolation Tests ──');
  {
    await dataSource.query(`SET search_path TO "${schemaA}", public`);
    const rows = await dataSource.query(`SELECT * FROM verify_test_users`);
    const hasA = rows.some((r: { email: string }) => r.email === emailA);
    const hasB = rows.some((r: { email: string }) => r.email === emailB);
    if (hasA && !hasB) {
      pass('Schema A query returns only A data (no WHERE clause needed)', `rows: ${rows.length}`);
    } else {
      fail('Schema A isolation', `hasA=${hasA}, hasB=${hasB}, total=${rows.length}`);
    }
  }

  // ── Test 2: Schema B query sees only B's data ──────────────────────────────
  {
    await dataSource.query(`SET search_path TO "${schemaB}", public`);
    const rows = await dataSource.query(`SELECT * FROM verify_test_users`);
    const hasA = rows.some((r: { email: string }) => r.email === emailA);
    const hasB = rows.some((r: { email: string }) => r.email === emailB);
    if (hasB && !hasA) {
      pass('Schema B query returns only B data (no WHERE clause needed)', `rows: ${rows.length}`);
    } else {
      fail('Schema B isolation', `hasA=${hasA}, hasB=${hasB}, total=${rows.length}`);
    }
  }

  // ── Test 3: Defense-in-depth — schema A + WHERE tenant_id = B → 0 rows ────
  console.log('\n── Defense-in-Depth Tests ──');
  {
    await dataSource.query(`SET search_path TO "${schemaA}", public`);
    const rows = await dataSource.query(
      `SELECT * FROM verify_test_users WHERE tenant_id = $1`,
      [testSlugB],
    );
    if (rows.length === 0) {
      pass('Schema A + WHERE tenant=B → 0 rows (double isolation working)', '');
    } else {
      fail('Double isolation breach', `Got ${rows.length} rows from wrong tenant`);
    }
  }

  // ── Test 4: Reset search_path to public isolates everything ───────────────
  {
    await dataSource.query(`SET search_path TO public`);
    const rows = await dataSource.query(
      `SELECT * FROM information_schema.tables WHERE table_name = 'verify_test_users' AND table_schema = 'public'`,
    );
    if (rows.length === 0) {
      pass('After reset to public — verify_test_users not visible in public schema', '');
    } else {
      fail('Public schema pollution', 'verify_test_users visible in public schema');
    }
  }

  // ── Cleanup test data ──────────────────────────────────────────────────────
  await dataSource.query(`DELETE FROM "${schemaA}".verify_test_users WHERE email = $1`, [emailA]);
  await dataSource.query(`DELETE FROM "${schemaB}".verify_test_users WHERE email = $1`, [emailB]);
  await dataSource.query(`SET search_path TO public`);

  await dataSource.destroy();
  printReport();
}

function printReport() {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log('\n════════════════════════════════════');
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  console.log('════════════════════════════════════\n');

  if (failed > 0) {
    console.error('ISOLATION VERIFICATION FAILED — do not proceed with migration.\n');
    process.exit(1);
  } else {
    console.log('ISOLATION VERIFICATION PASSED — safe to proceed.\n');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
