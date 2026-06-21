/**
 * Interactive first-run setup CLI.
 *
 * Usage:  npm run setup   (inside apps/auth-service)
 *
 * Reads the setup token from ~/.sentry/setup.log (written by the auth service
 * on first boot), prompts for platform identity and admin credentials, then
 * calls POST /superadmin/create-first-admin.
 *
 * The auth service must be running before this script is invoked.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { input, password as promptPassword, confirm } from "@inquirer/prompts";

const AUTH_SERVICE_URL =
  process.env["AUTH_SERVICE_URL"] ??
  process.env["NEXT_PUBLIC_AUTH_SERVICE_URL"] ??
  "http://localhost:4000";

const SETUP_LOG_DIR =
  process.env["SENTRY_SETUP_LOG_DIR"] ?? path.join(os.homedir(), ".sentry");
const SETUP_LOG_PATH = path.join(SETUP_LOG_DIR, "setup.log");

// ── Helpers ─────────────────────────────────────────────────────────────────

function readSetupToken(): string | null {
  try {
    const content = fs.readFileSync(SETUP_LOG_PATH, "utf8");

    const matches = [
      ...content.matchAll(/SETUP TOKEN:\s*([a-f0-9]{64})/gi)
    ];

    return matches.at(-1)?.[1] ?? null;
  } catch {
    return null;
  }
}

function validatePassword(value: string): string | true {
  if (value.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(value)) return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(value)) return "Password must contain at least one number";
  return true;
}

async function checkAuthService(): Promise<boolean> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/superadmin/platform-info`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getPlatformInfo(): Promise<{ slug: string; name: string; initialized: boolean } | null> {
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/superadmin/platform-info`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { slug: string; name: string; initialized: boolean };
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("");
  console.log("╔═══════════════════════════════════╗");
  console.log("║   Sentry Platform — First Run     ║");
  console.log("╚═══════════════════════════════════╝");
  console.log("");

  // 1. Check auth service reachability
  process.stdout.write("Connecting to auth service... ");
  const reachable = await checkAuthService();
  if (!reachable) {
    console.log("✗");
    console.error(`\nError: Auth service is not reachable at ${AUTH_SERVICE_URL}`);
    console.error("Make sure it is running before running setup.\n");
    process.exit(1);
  }
  console.log("✓");

  // 2. Check if already initialized
  const platformInfo = await getPlatformInfo();
  if (platformInfo?.initialized) {
    console.log("\nPlatform is already initialized.");
    console.log(`  Tenant:  ${platformInfo.name} (${platformInfo.slug})`);
    console.log(`  Portal:  http://localhost:3000\n`);
    process.exit(0);
  }

  // 3. Read setup token
  process.stdout.write(`Reading setup token from ${SETUP_LOG_PATH}... `);
  const setupToken = readSetupToken();
  console.log(`\n  Token: ${setupToken ?? "(not found)"}`);
  if (!setupToken) {
    console.log("✗");
    console.error("\nError: Could not read setup token from file.");
    console.error(`Expected location: ${SETUP_LOG_PATH}`);
    console.error(
      "\nAlternatively, find it in the auth service logs:\n  yarn dev | grep 'SETUP TOKEN'\n",
    );
    process.exit(1);
  }
  console.log("✓");
  console.log("");

  // 4. Prompts
  // defaultSlug reserved for future use when we add a slug prompt
  const defaultName = process.env["SENTRY_PLATFORM_NAME"] ?? platformInfo?.name ?? "Scrolloop Sentry";

  const platformName = await input({
    message: "Platform name:",
    default: defaultName,
  });

  const adminName = await input({
    message: "Admin full name:",
    validate: (v) => v.trim().length > 0 || "Name is required",
  });

  const adminEmail = await input({
    message: "Admin email:",
    validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email address",
  });

  let adminPassword: string;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    adminPassword = await promptPassword({
      message: "Admin password:",
      validate: validatePassword,
    });

    const confirm2 = await promptPassword({
      message: "Confirm password:",
    });

    if (adminPassword !== confirm2) {
      console.log("  ✗ Passwords do not match — try again.\n");
      continue;
    }
    break;
  }

  const proceed = await confirm({
    message: `\nCreate admin user "${adminEmail}" for platform "${platformName}"?`,
    default: true,
  });

  if (!proceed) {
    console.log("\nSetup cancelled.\n");
    process.exit(0);
  }

  // 5. Call API
  console.log("\nCreating admin account...");
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/superadmin/create-first-admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-setup-token": setupToken,
      },
      body: JSON.stringify({
        platformName,
        name: adminName,
        email: adminEmail,
        password: adminPassword,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      const msg = body.message ?? `HTTP ${res.status}`;
      console.error(`\n✗ Setup failed: ${msg}\n`);
      process.exit(1);
    }

    console.log("");
    console.log("  ✓ Admin user created");
    console.log(`  ✓ Platform initialized: ${platformName}`);
    console.log("");
    console.log("  Admin portal →  http://localhost:3000");
    console.log(`  Sign in with →  ${adminEmail}`);
    console.log("");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ Request failed: ${msg}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
