import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { Client } from "pg";
import { REPO_ROOT } from "../harness/config";

const TEST_DB = "scrolloop_sentry_test";

/** Connection string for the _test database only; refuses anything else (mirrors the backend's setup-env). */
function testDatabaseUrl(): string {
  const dev = fs.existsSync(path.join(REPO_ROOT, ".env")) ? dotenv.parse(fs.readFileSync(path.join(REPO_ROOT, ".env"))) : {};
  const explicit = process.env["E2E_DATABASE_URL"];
  const base = explicit ?? dev["DB_URL"] ?? dev["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/x";
  const url = new URL(base);
  if (!explicit) url.pathname = `/${TEST_DB}`;
  if (!/_test/.test(url.pathname)) throw new Error("Refusing to use a database that is not a _test database");
  return url.toString();
}

const schemaOf = (slug: string): string => `fk_${slug.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;

/**
 * Marks email as an enrolled second factor. The service has no endpoint that turns it on
 * (`mfa_settings.email_enabled` is never written), yet login challenges and /auth/mfa/verify
 * honour it, so the login-time chooser can only be exercised by seeding the flag.
 */
export async function enableEmailSecondFactor(slug: string, email: string): Promise<void> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const schema = schemaOf(slug);
    if (!/^fk_[a-z0-9_]+$/.test(schema)) throw new Error("unsafe schema name");
    const result = await client.query(
      `UPDATE "${schema}".mfa_settings SET email_enabled = true
        WHERE user_id = (SELECT id FROM "${schema}".users WHERE email = $1)`,
      [email],
    );
    if (result.rowCount !== 1) throw new Error(`no mfa_settings row for ${email} in ${schema}`);
  } finally {
    await client.end();
  }
}

/** Makes an outstanding invitation expire (stands in for waiting out its lifetime). */
export async function expireInvite(slug: string, email: string): Promise<void> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const schema = schemaOf(slug);
    if (!/^fk_[a-z0-9_]+$/.test(schema)) throw new Error("unsafe schema name");
    const result = await client.query(
      `UPDATE "${schema}".user_invites SET expires_at = now() - interval '1 minute' WHERE email = $1 AND accepted_at IS NULL`,
      [email],
    );
    if (result.rowCount !== 1) throw new Error(`expected one open invitation for ${email}, updated ${result.rowCount}`);
  } finally {
    await client.end();
  }
}

/** Turns on "two-step verification required for everyone" for a workspace (as the backend's own e2e does). */
export async function requireMfaForEveryone(slug: string): Promise<void> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const schema = schemaOf(slug);
    if (!/^fk_[a-z0-9_]+$/.test(schema)) throw new Error("unsafe schema name");
    const tenant = await client.query(`SELECT id FROM public.tenants WHERE slug = $1`, [slug]);
    const tenantId = tenant.rows[0]?.id as string | undefined;
    if (!tenantId) throw new Error(`unknown tenant ${slug}`);
    const updated = await client.query(`UPDATE "${schema}".tenant_mfa_policy SET enforce_for_all_users = true WHERE tenant_id = $1`, [tenantId]);
    if (updated.rowCount === 0) {
      await client.query(`INSERT INTO "${schema}".tenant_mfa_policy (tenant_id, enforce_for_all_users) VALUES ($1, true)`, [tenantId]);
    }
  } finally {
    await client.end();
  }
}
