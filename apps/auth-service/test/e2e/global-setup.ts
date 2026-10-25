import "reflect-metadata";
import "./setup-env";
import { DataSource } from "typeorm";
import Redis from "ioredis";
import { buildDataSourceOptions } from "@repo/database";
import { randomUUID } from "node:crypto";
import { TEST_DB_NAME, TEST_REDIS_DB } from "./setup-env";

/** fk_e2e_* schemas whose tenant is older than this are leftovers of finished/crashed runs. */
const STALE_SCHEMA_AGE_HOURS = 6;

/** Runs once: ensure the test DB exists, run migrations, empty the test Redis index. */
export default async function globalSetup(): Promise<void> {
  const url = new URL(process.env["DB_URL"] as string);
  if (url.pathname !== `/${TEST_DB_NAME}` && !/_test/.test(url.pathname)) {
    throw new Error("Refusing to run: not a _test database");
  }

  // Create the DB if missing (connect to maintenance DB on the same server).
  const admin = new URL(url.toString());
  admin.pathname = "/postgres";
  const adminDs = new DataSource({ type: "postgres", url: admin.toString() });
  await adminDs.initialize();
  const exists = await adminDs.query("SELECT 1 FROM pg_database WHERE datname = $1", [
    url.pathname.slice(1),
  ]);
  if (exists.length === 0) await adminDs.query(`CREATE DATABASE "${url.pathname.slice(1)}"`);
  await adminDs.destroy();

  const ds = new DataSource({ ...buildDataSourceOptions(process.env), migrationsRun: false });
  await ds.initialize();
  try {
    await ds.runMigrations({ transaction: "each" });
    process.env["E2E_RUN_ID"] = randomUUID();
    await dropStaleE2eSchemas(ds, url.pathname.slice(1));
  } finally {
    await ds.destroy();
  }

  // Only the dedicated index.
  const redis = new Redis({
    host: process.env["REDIS_HOST"],
    port: Number(process.env["REDIS_PORT"]),
    password: process.env["REDIS_PASSWORD"] || undefined,
    db: TEST_REDIS_DB,
  });
  // Stale rate-limit / throttle keys only; never FLUSHALL, and not the whole index (other runs may share it).
  for (const pattern of ["*:rl:*", "rl:*", "*throttle:*"]) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
  await redis.quit();
}

/**
 * Drops fk_e2e_* schemas of tenants created more than STALE_SCHEMA_AGE_HOURS ago. Age comes from the
 * tenants row, so a run that is still in progress (this one or a parallel one) is never touched.
 * Guarded on the database name; nothing outside the fk_e2e_ prefix is considered.
 */
async function dropStaleE2eSchemas(ds: DataSource, dbName: string): Promise<void> {
  if (!/_test/.test(dbName)) throw new Error("Refusing to drop stale schemas: not a _test database");
  const stale = (await ds.query(
    `SELECT n.nspname AS name
       FROM pg_namespace n
       JOIN public.tenants t ON n.nspname = 'fk_' || lower(regexp_replace(t.slug, '[^a-z0-9_]', '_', 'gi'))
      WHERE n.nspname LIKE 'fk\\_e2e\\_%' ESCAPE '\\'
        AND t.created_at < now() - ($1 || ' hours')::interval`,
    [String(STALE_SCHEMA_AGE_HOURS)],
  )) as Array<{ name: string }>;
  for (const { name } of stale) {
    if (/^fk_e2e_[a-z0-9_]+$/.test(name)) await ds.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
  }
  process.stderr.write(`[e2e setup] dropped ${stale.length} stale fk_e2e_* schema(s) older than ${STALE_SCHEMA_AGE_HOURS}h in ${dbName}\n`);
}
