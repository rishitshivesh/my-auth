import { randomBytes } from "node:crypto";
import type { Response } from "supertest";
import type { CapturedMail } from "./mail-capture";
import { trackSchema } from "../schema-tracker";
import { STRONG_PASSWORD } from "./constants";
import type { HttpOptions, TestApp } from "./test-app";

export interface TenantFixture {
  tenantId: string;
  slug: string;
  admin: { email: string; password: string; accessToken: string; cookies: string[] };
}

export interface LoginResult {
  res: Response;
  accessToken: string;
  refreshToken: string;
  cookies: string[];
}

export interface UserFixture {
  email: string;
  password: string;
}

const rand = (n = 6): string => randomBytes(n).toString("hex");

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${rand()}@e2e.example.com`;
}

export function uniqueSlug(prefix = "e2e"): string {
  const slug = `${prefix}-${rand(5)}`;
  trackSchema(`fk_${slug.replace(/[^a-z0-9_]/g, "_")}`); // teardown drops what this run created
  return slug;
}

export function withTenantHeader(slug: string): Pick<HttpOptions, "tenant"> {
  return { tenant: slug };
}

export function cookiesOf(res: Response): string[] {
  const raw = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export function cookieValue(cookies: string[], name: string): string {
  const hit = cookies.find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.split(";")[0]!.slice(name.length + 1)) : "";
}

/** Merge cookie jars: later set-cookie values for the same name win; cleared cookies are dropped. */
export function mergeCookies(base: string[], next: string[]): string[] {
  const map = new Map<string, string>();
  for (const c of [...base, ...next]) {
    const name = c.split("=")[0]!;
    const value = c.split(";")[0]!.slice(name.length + 1);
    if (value === "") map.delete(name);
    else map.set(name, c);
  }
  return [...map.values()];
}

/**
 * Finds a URL containing `pathFragment` in a captured mail (props, text or html).
 * Returns the full URL string.
 */
export function extractLink(mail: CapturedMail, pathFragment: string): string {
  const haystacks = [JSON.stringify(mail.props), mail.text, mail.html];
  for (const h of haystacks) {
    const m = h.match(new RegExp(`https?:[^\\s"'<>\\\\]*${pathFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\s"'<>\\\\]*`));
    if (m) return m[0].replace(/&amp;/g, "&");
  }
  throw new Error(`No link containing "${pathFragment}" in mail "${mail.template}" to ${mail.to}`);
}

export function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get("token") ?? "";
}

/**
 * Deletes rate-limit and login-throttle keys (only those) on the dedicated test Redis index.
 * Targeted on purpose: other specs may run concurrently against the same index.
 */
export async function clearRateLimits(t: TestApp): Promise<void> {
  for (const pattern of ["*:rl:*", "rl:*", "*throttle:*"]) {
    const keys = await t.redis.keys(pattern);
    if (keys.length > 0) await t.redis.del(...keys);
  }
}

export async function createTenant(
  t: TestApp,
  opts: { slug?: string; adminEmail?: string; adminPassword?: string; name?: string } = {},
): Promise<TenantFixture> {
  const slug = opts.slug ?? uniqueSlug();
  const email = opts.adminEmail ?? uniqueEmail("admin");
  const password = opts.adminPassword ?? STRONG_PASSWORD;
  const res = await t.http().post("/tenants/register").send({
    workspaceName: opts.name ?? `E2E ${slug}`,
    slug,
    adminName: "E2E Admin",
    adminEmail: email,
    adminPassword: password,
    idempotencyKey: rand(8),
  });
  if (res.status !== 201) {
    throw new Error(`createTenant failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const rows = await t.db.query(`SELECT id FROM public.tenants WHERE slug = $1`, [slug]);
  const login = await loginUser(t, { slug }, email, password);
  return {
    tenantId: rows[0].id as string,
    slug,
    admin: { email, password, accessToken: login.accessToken, cookies: login.cookies },
  };
}

export async function loginUser(
  t: TestApp,
  tenant: { slug: string },
  email: string,
  password: string,
  opts: HttpOptions = {},
): Promise<LoginResult> {
  const res = await t.http({ tenant: tenant.slug, ...opts }).post("/auth/login").send({ email, password });
  const cookies = cookiesOf(res);
  return {
    res,
    cookies,
    accessToken: cookieValue(cookies, "accessToken"),
    refreshToken: cookieValue(cookies, "refreshToken"),
  };
}

/** Alias matching the harness contract: login(t, tenant, email, password). */
export const login = loginUser;

/** Registers through the real API, verifies the email through the mailed token. */
export async function registerAndVerifyUser(
  t: TestApp,
  tenant: { slug: string },
  opts: { email?: string; password?: string; firstName?: string } = {},
): Promise<UserFixture> {
  const email = opts.email ?? uniqueEmail();
  const password = opts.password ?? STRONG_PASSWORD;
  const reg = await t
    .http({ tenant: tenant.slug })
    .post("/auth/register")
    .send({ email, password, firstName: opts.firstName ?? "E2E" });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const mail = t.mail.last(email, "verify-email");
  if (!mail) throw new Error("verification email was not captured");
  const verify = await t
    .http({ tenant: tenant.slug })
    .post("/auth/verify-email")
    .send({ token: tokenFromLink(extractLink(mail, "/verify-email")) });
  if (verify.status !== 200) throw new Error(`verify failed: ${verify.status} ${JSON.stringify(verify.body)}`);
  return { email, password };
}

/** Tenant schema name for raw SQL in specs (fk_<slug with - -> _>). */
export function schemaOf(slug: string): string {
  return `fk_${slug.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
}
