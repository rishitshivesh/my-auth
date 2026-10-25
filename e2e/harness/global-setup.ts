import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import {
  API_PORT, BACKEND_DIR, PORTAL_DIR, PORTAL_PORT, REPO_ROOT, RUNTIME_DIR, backendEnv, portalEnv,
} from "./config";
import { startMailSink } from "./mail-sink";
import { assertPortFree, start, stop, waitForHttp, type Managed } from "./processes";

const NODE = process.execPath;
const HARNESS = path.join(REPO_ROOT, "e2e/harness");
const loopback = `http://127.0.0.1:${API_PORT}`;

function sh(label: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    const log = fs.openSync(path.join(RUNTIME_DIR, `${label}.log`), "w");
    const child = spawn(NODE, args, { cwd, env, stdio: ["ignore", log, log] });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} failed (exit ${code}). See e2e/.runtime/${label}.log`)),
    );
  });
}

const tsNode = ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register"];

/** Migrates the _test database with the backend's own e2e global setup (it refuses non-_test names). */
function migrate(): Promise<void> {
  const script = "require('./test/e2e/global-setup').default().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})";
  return sh("migrate", [...tsNode, "-e", script], BACKEND_DIR, { ...process.env, E2E_DB_LOGGING: "false" });
}

async function ensurePlatformInitialized(): Promise<void> {
  const init = await fetch(`${loopback}/superadmin/initialized`);
  const body = (await init.json()) as { data?: { initialized?: boolean }; initialized?: boolean };
  if ((body.data ?? body).initialized) return;
  const hint = (await (await fetch(`${loopback}/superadmin/setup-log-hint`)).json()) as { data?: { path?: string | null }; path?: string | null };
  const file = (hint.data ?? hint).path;
  if (!file) throw new Error("Platform is not initialised and no setup log path is available (SENTRY_SETUP_LOG_DIR).");
  const tokens = [...fs.readFileSync(file, "utf8").matchAll(/SETUP TOKEN:\s*([a-f0-9]{64})/gi)];
  const token = tokens.at(-1)?.[1];
  if (!token) throw new Error(`No SETUP TOKEN in ${file}.`);
  const res = await fetch(`${loopback}/superadmin/create-first-admin`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-setup-token": token },
    body: JSON.stringify({ name: "Platform Root", email: "platform-root@e2e.example.com", password: "Tr0ub4dor&3-Xylophone!" }),
  });
  if (res.status !== 201) throw new Error(`create-first-admin answered ${res.status}`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const started: Managed[] = [];
  let sink: { close: () => Promise<void> } | undefined;
  const teardown = async (): Promise<void> => {
    for (const proc of started.reverse()) await stop(proc);
    await sink?.close();
  };

  const runId = randomBytes(3).toString("hex");
  process.env["E2E_RUN_ID"] = runId;
  process.env["E2E_API_LOOPBACK"] = loopback;

  try {
    await Promise.all([API_PORT, PORTAL_PORT].map(assertPortFree));
    await migrate();
    sink = await startMailSink();

    const backend = start(
      "backend",
      NODE,
      [...tsNode, "-r", "./test/e2e/setup-env.ts", "-r", path.join(HARNESS, "env-overrides.cjs"), "src/main.ts"],
      { cwd: BACKEND_DIR, env: { ...process.env, E2E_ENV_JSON: JSON.stringify(backendEnv(runId)) } },
    );
    started.push(backend);
    await waitForHttp(`${loopback}/superadmin/platform-info`, "auth-service", backend, 120_000);
    await ensurePlatformInitialized();

    // The portal consumes the SDK's built output, so make sure it reflects the sources under test.
    await sh("sdk-build", [require.resolve("tsup/dist/cli-default.js", { paths: [path.join(REPO_ROOT, "packages/sdk-typescript")] })], path.join(REPO_ROOT, "packages/sdk-typescript"), process.env);

    const portalBase = { ...process.env, ...portalEnv(), NODE_OPTIONS: `--require ${path.join(HARNESS, "dns-map.cjs")}` };
    const nextBin = require.resolve("next/dist/bin/next", { paths: [PORTAL_DIR] });
    if (process.env["E2E_SKIP_BUILD"] !== "1" || !fs.existsSync(path.join(PORTAL_DIR, ".next-e2e/BUILD_ID"))) {
      await sh("portal-build", [nextBin, "build"], PORTAL_DIR, portalBase);
    }
    const portal = start("portal", NODE, [nextBin, "start", "-p", String(PORTAL_PORT)], { cwd: PORTAL_DIR, env: portalBase });
    started.push(portal);
    await waitForHttp(`http://127.0.0.1:${PORTAL_PORT}/u/login`, "portal", portal, 60_000);
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
