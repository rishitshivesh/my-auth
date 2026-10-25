import { type TenantKey, tenantSlugFor } from "../harness/config";

export const runId = (): string => {
  const id = process.env["E2E_RUN_ID"];
  if (!id) throw new Error("E2E_RUN_ID missing: the Playwright global setup did not run.");
  return id;
};
export const apiLoopback = (): string => process.env["E2E_API_LOOPBACK"] ?? "http://127.0.0.1:4110";
export const slugOf = (key: TenantKey): string => tenantSlugFor(runId(), key);

export const STRONG_PASSWORD = "Tr0ub4dor&3-Xylophone!";
export const NEW_PASSWORD = "Zebra!Quartz-7-Marmalade";

let counter = 0;
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${runId()}-${Date.now().toString(36)}${counter}@e2e.example.com`;
}
