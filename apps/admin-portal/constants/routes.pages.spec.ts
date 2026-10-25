import { existsSync } from "node:fs";
import { join } from "node:path";
import { accountRoutes, authRoutes, onboardingRoutes, platformRoutes, tenantRoutes } from "./routes";
import { accountNav, platformNav, tenantNav } from "./navigation";

const APP_DIR = join(__dirname, "..", "app");
const SAMPLE_ID = "sample";

/** Does `app/` contain a page for this path, allowing dynamic `[param]` segments? */
function hasPage(path: string): boolean {
  const segments = path.split("?")[0]!.split("/").filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) return existsSync(join(dir, "page.tsx"));
    const [head, ...tail] = rest;
    if (existsSync(join(dir, head!)) && walk(join(dir, head!), tail)) return true;
    return ["[slug]", "[tenantId]", "[token]", "[id]", "[clientId]"].some(
      (dynamic) => existsSync(join(dir, dynamic)) && walk(join(dir, dynamic), tail),
    );
  };
  return walk(APP_DIR, segments);
}

describe("route constants map to pages", () => {
  const tenant = tenantRoutes(SAMPLE_ID);
  const builders: Record<string, string> = {
    ...Object.fromEntries(Object.entries(authRoutes).map(([k, fn]) => [`auth.${k}`, k === "invite" ? authRoutes.invite(SAMPLE_ID) : (fn as () => string)()])),
    ...Object.fromEntries(Object.entries(onboardingRoutes).map(([k, fn]) => [`onboarding.${k}`, fn()])),
    ...Object.fromEntries(Object.entries(accountRoutes).map(([k, fn]) => [`account.${k}`, fn()])),
    ...Object.fromEntries(Object.entries(platformRoutes).map(([k, fn]) => [`platform.${k}`, k === "tenant" ? platformRoutes.tenant(SAMPLE_ID) : (fn as () => string)()])),
    ...Object.fromEntries(
      Object.entries(tenant).map(([k, fn]) => [`tenant.${k}`, (fn as (id?: string) => string)(SAMPLE_ID)]),
    ),
  };

  it.each(Object.entries(builders))("%s has a page", (name, path) => {
    // tenant.root is a redirect target handled by app/t/[slug]; allow it to be missing a page of its own.
    if (name === "tenant.root") return;
    expect({ name, path, found: hasPage(path) }).toEqual({ name, path, found: true });
  });

  it("every navigation entry points at an existing page", () => {
    const entries = [...tenantNav(SAMPLE_ID), ...platformNav(), ...accountNav()];
    const missing = entries.filter((entry) => !hasPage(entry.href)).map((entry) => entry.href);
    expect(missing).toEqual([]);
  });
});
