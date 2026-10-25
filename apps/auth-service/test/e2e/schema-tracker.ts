import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Tenant schema names a run may drop at teardown: fk_ + lowercase alphanumerics/underscore. */
export const TRACKABLE_SCHEMA = /^fk_[a-z0-9_]+$/;

export function trackFilePath(runId: string): string {
  return path.join(os.tmpdir(), `sentry-e2e-schemas-${runId}.txt`);
}

/** Record a schema the current run creates so teardown drops exactly (and only) those. */
export function trackSchema(schemaName: string): void {
  const runId = process.env["E2E_RUN_ID"];
  if (!runId || !TRACKABLE_SCHEMA.test(schemaName)) return;
  fs.appendFileSync(trackFilePath(runId), `${schemaName}\n`);
}

export function readTrackedSchemas(runId: string): string[] {
  const file = trackFilePath(runId);
  if (!fs.existsSync(file)) return [];
  const names = fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => TRACKABLE_SCHEMA.test(l));
  return [...new Set(names)];
}
