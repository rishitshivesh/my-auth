import { createHash, randomBytes, generateKeyPairSync, createSign } from "node:crypto";
import { TenantJobRunner } from "@/core/database/tenant-job-runner.service";
import { OAuthTokenService } from "@/modules/oauth/services/oauth-token.service";
import type { TestApp, TenantFixture } from "../support";

export const REDIRECT = "https://app.example.com/callback";

export interface ClientFixture {
  id: string; // DB uuid
  clientId: string;
  clientSecret?: string;
}

export function b64u(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function basic(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [h, p] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(h!, "base64url").toString()),
    payload: JSON.parse(Buffer.from(p!, "base64url").toString()),
  };
}

/** Signs a JWT with an arbitrary RSA key (for forgery tests). */
export function forgeRs256(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return `${signingInput}.${b64u(sig)}`;
}

export async function createClient(
  t: TestApp,
  tenant: TenantFixture,
  over: Record<string, unknown> = {},
): Promise<ClientFixture> {
  const res = await t
    .http({ tenant: tenant.slug, bearer: tenant.admin.accessToken })
    .post("/oauth/clients")
    .send({
      name: "e2e client",
      clientType: "confidential",
      grantTypes: ["authorization_code", "refresh_token", "client_credentials"],
      redirectUris: [REDIRECT],
      allowedScopes: ["openid", "profile", "email", "read"],
      defaultScopes: ["openid"],
      ...over,
    });
  if (res.status !== 201) throw new Error(`createClient failed ${res.status} ${JSON.stringify(res.body)}`);
  const d = res.body.data;
  return { id: d.id, clientId: d.clientId, clientSecret: d.clientSecret };
}

export async function userIdOf(t: TestApp, slug: string, email: string): Promise<string> {
  const schema = `fk_${slug.replace(/-/g, "_")}`;
  const rows = await t.db.query(`SELECT id FROM "${schema}".users WHERE email = $1`, [email]);
  return rows[0].id as string;
}

/** Issues an authorization code in-process (the /oauth/authorize endpoint has no session wiring). */
export async function seedCode(
  t: TestApp,
  tenant: TenantFixture,
  client: ClientFixture,
  opts: { userId: string; redirectUri?: string; scope?: string; challenge?: string; method?: "S256"; nonce?: string } ,
): Promise<string> {
  const runner = t.app.get(TenantJobRunner);
  const tokens = t.app.get(OAuthTokenService);
  return runner.runInTenant(tenant.slug, () =>
    tokens.createAuthorizationCode({
      tenantId: tenant.tenantId,
      clientId: client.id,
      userId: opts.userId,
      redirectUri: opts.redirectUri ?? REDIRECT,
      scope: opts.scope ?? "openid email",
      codeChallenge: opts.challenge,
      codeChallengeMethod: opts.challenge ? (opts.method ?? "S256") : undefined,
      nonce: opts.nonce,
    }),
  );
}

export function tenantSchema(slug: string): string {
  return `fk_${slug.replace(/-/g, "_")}`;
}
