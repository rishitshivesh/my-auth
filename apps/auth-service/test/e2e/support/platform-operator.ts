import { readFileSync } from "node:fs";
import { hashPassword } from "@/modules/auth/password-hashing";
import { STRONG_PASSWORD } from "./constants";
import { cookieValue, cookiesOf, loginUser } from "./helpers";
import type { TestApp } from "./test-app";

export const PLATFORM_SLUG = process.env["SENTRY_PLATFORM_SLUG"] ?? "sentry";
export const PLATFORM_ROOT_EMAIL = "platform-root@e2e.example.com";

/**
 * Returns an access token for the platform operator, creating or repairing the account
 * so the result never depends on what an earlier run left in the test DB. If that is
 * impossible it throws with the reason: operator tests must never pass by skipping.
 */
export async function ensurePlatformOperator(t: TestApp): Promise<string> {
  const dbName = new URL(process.env["DB_URL"] as string).pathname;
  if (!/_test/.test(dbName)) throw new Error("Refusing to touch the platform operator outside a _test database");

  const init = await t.http().get("/superadmin/initialized");
  if (!(init.body.data ?? init.body).initialized) return bootstrapFirstAdmin(t);

  const first = await loginUser(t, { slug: PLATFORM_SLUG }, PLATFORM_ROOT_EMAIL, STRONG_PASSWORD);
  if (first.accessToken) return first.accessToken;

  // Initialised with other credentials (or locked out): repair the harness operator, test DB only.
  const schema = `fk_${PLATFORM_SLUG.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
  const hash = await hashPassword(STRONG_PASSWORD);
  const repaired = await t.db.query(
    `UPDATE "${schema}".users
        SET password_hash = $2, status = 'active', failed_login_attempts = 0, locked_until = NULL, force_password_change = false
      WHERE email = $1 RETURNING id`,
    [PLATFORM_ROOT_EMAIL, hash],
  );
  const rows = (Array.isArray(repaired[0]) ? repaired[0] : repaired) as unknown[];
  if (rows.length === 0) {
    throw new Error(
      `Platform operator tests cannot run: the platform is initialised but ${PLATFORM_ROOT_EMAIL} does not exist in ${schema}. ` +
        "Reset the _test database (drop and recreate it) so the harness can bootstrap the operator.",
    );
  }
  const retry = await loginUser(t, { slug: PLATFORM_SLUG }, PLATFORM_ROOT_EMAIL, STRONG_PASSWORD);
  if (!retry.accessToken) {
    throw new Error(`Platform operator login still fails after repairing ${PLATFORM_ROOT_EMAIL} (status ${retry.res.status}).`);
  }
  return retry.accessToken;
}

async function bootstrapFirstAdmin(t: TestApp): Promise<string> {
  const hint = (await t.http().get("/superadmin/setup-log-hint")).body;
  const file = (hint.data ?? hint).path as string | null;
  if (!file) throw new Error("Platform operator bootstrap failed: setup-log-hint returned no setup log path (set SENTRY_SETUP_LOG_DIR).");
  const tokens = [...readFileSync(file, "utf8").matchAll(/SETUP TOKEN:\s*([a-f0-9]{64})/gi)];
  const token = tokens.at(-1)?.[1];
  if (!token) throw new Error(`Platform operator bootstrap failed: no SETUP TOKEN found in ${file}.`);
  const created = await t
    .http()
    .post("/superadmin/create-first-admin")
    .set("x-setup-token", token)
    .send({ name: "Platform Root", email: PLATFORM_ROOT_EMAIL, password: STRONG_PASSWORD });
  if (created.status !== 201) throw new Error(`Platform operator bootstrap failed: create-first-admin answered ${created.status}.`);
  return cookieValue(cookiesOf(created), "accessToken");
}
