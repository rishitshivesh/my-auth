import { JwtService } from "@nestjs/jwt";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import {
  STRONG_PASSWORD,
  extractLink,
  loginUser,
  uniqueEmail,
  type TenantFixture,
  type TestApp,
} from "../support";

export interface Member {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  cookies: string[];
}

export function decodeJwt(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
}

/** Authenticated client for a tenant fixture's owner (or any token). */
export function as(t: TestApp, slug: string, bearer: string) {
  return t.http({ tenant: slug, bearer });
}

export async function roleIdOf(t: TestApp, fx: TenantFixture, name: string): Promise<string> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await as(t, fx.slug, fx.admin.accessToken).get("/rbac/roles");
    const roles = res.body?.data as Array<{ id: string; name: string }> | undefined;
    const hit = roles?.find((r) => r.name === name);
    if (hit) return hit.id;
    last = `${res.status} ${JSON.stringify(res.body)}`;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`role ${name} not found: ${last}`);
}

/** Invites + accepts + logs in a user holding the given system role (default member). */
export async function addMember(
  t: TestApp,
  fx: TenantFixture,
  roleName = "member",
  email = uniqueEmail("member"),
): Promise<Member> {
  const roleId = await roleIdOf(t, fx, roleName);
  const inv = await as(t, fx.slug, fx.admin.accessToken).post("/users/invite").send({ email, roleIds: [roleId] });
  if (inv.status !== 201) throw new Error(`invite failed ${inv.status} ${JSON.stringify(inv.body)}`);
  const mail = t.mail.last(email);
  if (!mail) throw new Error("invite mail not captured");
  const token = extractLink(mail, "/invite/").split("/invite/")[1]!;
  const acc = await t
    .http({ tenant: fx.slug })
    .post("/auth/invite/accept")
    .send({ token, name: "Mem Ber", password: STRONG_PASSWORD });
  if (acc.status !== 201) throw new Error(`accept failed ${acc.status} ${JSON.stringify(acc.body)}`);
  const login = await loginUser(t, fx, email, STRONG_PASSWORD);
  if (!login.accessToken) throw new Error(`member login failed ${login.res.status} ${JSON.stringify(login.res.body)}`);
  return {
    id: decodeJwt(login.accessToken)["sub"] as string,
    email,
    password: STRONG_PASSWORD,
    accessToken: login.accessToken,
    cookies: login.cookies,
  };
}

export function adminUserId(fx: TenantFixture): string {
  return decodeJwt(fx.admin.accessToken)["sub"] as string;
}

/** Signs a JWT with the tenant's real signing key (for claim-tampering / stale-auth scenarios). */
export async function mintToken(
  t: TestApp,
  signingTenantId: string,
  claims: Record<string, unknown>,
  expiresIn = "10m",
): Promise<string> {
  const { kid, privateKey } = await t.app.get(JwksService).getCurrentSigningKey(signingTenantId);
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  return t.app.get(JwtService).sign(claims, {
    privateKey: pem,
    algorithm: "RS256",
    header: { alg: "RS256", kid },
    expiresIn: expiresIn as never,
  });
}

export interface AuditItem {
  eventType: string;
  userId?: string | null;
  actorEmail?: string | null;
  requestId?: string | null;
  resourceId?: string | null;
  severity?: string;
  metadata?: Record<string, unknown> | null;
}

/** Audit events via the API (security events are written asynchronously, so poll briefly). */
export async function auditItems(t: TestApp, fx: TenantFixture, query = "limit=200"): Promise<AuditItem[]> {
  await new Promise((r) => setTimeout(r, 400));
  const res = await as(t, fx.slug, fx.admin.accessToken).get(`/audit?${query}`);
  if (res.status !== 200) throw new Error(`audit list failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.items as AuditItem[];
}

export async function eventTypes(t: TestApp, fx: TenantFixture): Promise<string[]> {
  return (await auditItems(t, fx)).map((i) => i.eventType);
}
