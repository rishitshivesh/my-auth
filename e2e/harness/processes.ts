import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { RUNTIME_DIR } from "./config";

export interface Managed {
  name: string;
  child: ChildProcess;
}

export function start(
  name: string,
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Managed {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  const log = fs.openSync(path.join(RUNTIME_DIR, `${name}.log`), "w");
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", log, log],
    detached: true,
  });
  return { name, child };
}

/** SIGTERM the whole process group, then SIGKILL stragglers. */
export async function stop(proc: Managed | undefined): Promise<void> {
  const pid = proc?.child.pid;
  if (!proc || !pid || proc.child.exitCode !== null) return;
  const signal = (sig: NodeJS.Signals): void => {
    try {
      process.kill(-pid, sig);
    } catch {
      // already gone
    }
  };
  signal("SIGTERM");
  const deadline = Date.now() + 8000;
  while (proc.child.exitCode === null && Date.now() < deadline) await sleep(100);
  if (proc.child.exitCode === null) signal("SIGKILL");
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is already in use; stop that process or set E2E_*_PORT.`)));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
  });
}

export async function waitForHttp(url: string, label: string, proc: Managed, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) {
      throw new Error(`${label} exited early (code ${proc.child.exitCode}). See e2e/.runtime/${proc.name}.log`);
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.status < 500) return;
      last = `HTTP ${res.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  throw new Error(`${label} did not become ready within ${timeoutMs}ms (${last}). See e2e/.runtime/${proc.name}.log`);
}
