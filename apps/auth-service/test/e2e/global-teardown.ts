import * as fs from "node:fs";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "@repo/database";
import "./setup-env";
import { readTrackedSchemas, trackFilePath } from "./schema-tracker";

/** Drops only the schemas this run created (recorded by trackSchema), in a `_test` database only. */
export default async function globalTeardown(): Promise<void> {
  const runId = process.env["E2E_RUN_ID"];
  if (!runId) return;
  const names = readTrackedSchemas(runId);
  const dbName = new URL(process.env["DB_URL"] as string).pathname;
  if (!/_test/.test(dbName)) throw new Error("Refusing to drop schemas: not a _test database");

  if (names.length > 0) {
    const ds = new DataSource({ ...buildDataSourceOptions(process.env), migrationsRun: false, logging: false });
    await ds.initialize();
    try {
      for (const name of names) await ds.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
    } finally {
      await ds.destroy();
    }
  }
  process.stderr.write(`[e2e teardown] dropped ${names.length} schema(s) created by run ${runId}\n`);
  fs.rmSync(trackFilePath(runId), { force: true });
}
