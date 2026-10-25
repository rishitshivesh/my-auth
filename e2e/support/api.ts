import { randomBytes } from "node:crypto";
import { ROOT_DOMAIN, type TenantKey } from "../harness/config";
import { apiLoopback, NEW_PASSWORD, runId, slugOf, STRONG_PASSWORD, uniqueEmail } from "./env";
import { linkWith, mark, tokenOf, waitForMail } from "./mail";
import { totpNow } from "./totp";

export interface ApiResult<T = Record<string, unknown>> {
  status: number;
  body: T;
  data: any;
}

const randomIp = (): string => `10.${1 + Math.floor(Math.random() * 253)}.${1 + Math.floor(Math.random() * 253)}.${1 + Math.floor(Math.random() * 253)}`;

/** Server-side API session (no browser): own cookie jar, own random client IP so rate limits never couple. */
export class ApiSession {
  private readonly jar = new Map<string, string>();
  private readonly ip = randomIp();
  constructor(readonly slug: string) {}

  async request(method: string, path: string, body?: unknown): Promise<ApiResult> {
    const res = await fetch(`${apiLoopback()}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-tenant-slug": this.slug,
        "x-forwarded-for": this.ip,
        cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair = ""] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
    const text = await res.text();
    let parsed: any = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    return { status: res.status, body: parsed, data: parsed?.data ?? parsed };
  }

  /** Session cookies as Playwright cookies on the shared parent domain, to start a browser already signed in. */
  browserCookies(): Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Strict" }> {
    return [...this.jar]
      .filter(([name]) => name === "accessToken" || name === "refreshToken")
      .map(([name, value]) => ({ name, value, domain: `.${ROOT_DOMAIN}`, path: "/", httpOnly: true, sameSite: "Strict" as const }));
  }

  async expectOk(method: string, path: string, body?: unknown): Promise<ApiResult> {
    const res = await this.request(method, path, body);
    if (res.status >= 300) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res;
  }

  async login(email: string, password: string): Promise<ApiResult> {
    return this.request("POST", "/auth/login", { email, password });
  }
}

export interface TenantFixture {
  slug: string;
  name: string;
  ownerEmail: string;
  password: string;
  owner: ApiSession;
}

/** Creates the journey's workspace through the public self-service API; the owner is signed in on `owner`. */
export async function createTenant(key: TenantKey, opts: { password?: string } = {}): Promise<TenantFixture> {
  const slug = slugOf(key);
  // Deterministic per run+key so a spec file (or a restarted worker) can reuse the workspace it created.
  const ownerEmail = `owner-${runId()}-${key}@e2e.example.com`;
  const password = opts.password ?? STRONG_PASSWORD;
  const name = `E2E ${key}`;
  const owner = new ApiSession(slug);
  const res = await new ApiSession("").request("POST", "/tenants/register", {
    workspaceName: name,
    slug,
    adminName: "E2E Owner",
    adminEmail: ownerEmail,
    adminPassword: password,
    idempotencyKey: randomBytes(8).toString("hex"),
  });
  if (res.status !== 201 && res.status !== 409) throw new Error(`createTenant ${slug} -> ${res.status} ${JSON.stringify(res.body)}`);
  const login = await owner.login(ownerEmail, password);
  if (login.status !== 200) throw new Error(`owner login ${login.status} ${JSON.stringify(login.body)}`);
  return { slug, name, ownerEmail, password, owner };
}

/** Self-registers a user and verifies the address through the emailed link, like a person would. */
export async function createVerifiedUser(
  slug: string,
  opts: { email?: string; password?: string; firstName?: string } = {},
): Promise<{ email: string; password: string }> {
  const email = opts.email ?? uniqueEmail("user");
  const password = opts.password ?? STRONG_PASSWORD;
  const after = await mark(email);
  const session = new ApiSession(slug);
  await session.expectOk("POST", "/auth/register", { email, password, firstName: opts.firstName ?? "E2E" });
  const mail = await waitForMail(email, { after, linkContains: "verify-email" });
  await session.expectOk("POST", "/auth/verify-email", { token: tokenOf(linkWith(mail, "verify-email")) });
  return { email, password };
}

/** Turns on TOTP for a signed-in session; returns the secret and the one-time backup codes. */
export async function enrollTotp(session: ApiSession): Promise<{ secret: string; backupCodes: string[] }> {
  const setup = await session.expectOk("POST", "/mfa/setup/totp");
  const secret = setup.data.secret as string;
  const enabled = await session.expectOk("POST", "/mfa/verify/totp", { token: totpNow(secret) });
  return { secret, backupCodes: enabled.data.backupCodes as string[] };
}

export async function roleId(session: ApiSession, name: string): Promise<string> {
  const roles = await session.expectOk("GET", "/rbac/roles");
  const hit = (roles.data as Array<{ id: string; name: string }>).find((r) => r.name === name);
  if (!hit) throw new Error(`role ${name} not found`);
  return hit.id;
}

/** Sends an invitation and returns its link (rewritten later by the caller onto the tenant host). */
export async function invite(owner: ApiSession, email: string, role = "member"): Promise<string> {
  const after = await mark(email);
  await owner.expectOk("POST", "/users/invite", { email, roleIds: [await roleId(owner, role)] });
  const mail = await waitForMail(email, { after, linkContains: "/invite/" });
  return linkWith(mail, "/invite/");
}

export { NEW_PASSWORD, STRONG_PASSWORD };

/** Tenant "login methods" switches (owner only), e.g. { magicLinkEnabled: true }. */
export async function setFeatureFlags(owner: ApiSession, flags: Record<string, boolean>): Promise<void> {
  await owner.expectOk("PATCH", "/dashboard/tenant-settings", { featureFlags: flags });
}
