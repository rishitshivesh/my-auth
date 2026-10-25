import request from "supertest";
import { createHmac } from "node:crypto";
import { TenantService } from "@/modules/tenant/tenant.service";
import { createTestApp, createTenant, loginUser, type TenantFixture, type TestApp } from "../support";
import { addMember, adminUserId, as, decodeJwt, mintToken, roleIdOf, type Member } from "../_shared/fixtures";

const withoutTimes = (c: Record<string, unknown>): Record<string, unknown> => {
  const { iat: _iat, exp: _exp, ...rest } = c;
  return rest;
};
type Verb = "get" | "put" | "post" | "patch" | "delete";
const DOC = { Version: "2024-01-01", Statement: [{ Effect: "Allow", Action: ["users:read"], Resource: ["sentry:tenant:*:*"] }] };

describe("tenant isolation", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  let aOwner: ReturnType<typeof as>;
  let bOwner: ReturnType<typeof as>;
  let aMember: Member;
  let bMember: Member;
  let bIds: { roleId: string; permissionId: string; policyId: string; groupId: string; sessionId: string; memberId: string; ownerId: string };

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
    aOwner = as(t, a.slug, a.admin.accessToken);
    bOwner = as(t, b.slug, b.admin.accessToken);
    aMember = await addMember(t, a, "member");
    bMember = await addMember(t, b, "member");
    const role = await bOwner.post("/rbac/roles").send({ name: "b-only-role" });
    const perm = await bOwner.post("/rbac/permissions").send({ name: "bdocs:read", resource: "bdocs", action: "read" });
    const pol = await bOwner.post("/rbac/policies").send({ name: "b-only-policy", document: DOC });
    const grp = await bOwner.post("/rbac/groups").send({ name: "b-only-group" });
    bIds = {
      roleId: role.body.data.id,
      permissionId: perm.body.data.id,
      policyId: pol.body.data.id,
      groupId: grp.body.data.id,
      sessionId: decodeJwt(bMember.accessToken)["sessionId"] as string,
      memberId: bMember.id,
      ownerId: adminUserId(b),
    };
  });
  afterAll(async () => {
    await t.close();
  });

  describe("A's owner cannot reach B's objects by id (every verb)", () => {
    const cases = (): Array<[Verb, string, Record<string, unknown> | undefined]> => [
      ["get", `/users/${bIds.memberId}`, undefined],
      ["put", `/users/${bIds.memberId}`, { firstName: "Hijacked" }],
      ["delete", `/users/${bIds.memberId}`, undefined],
      ["post", `/users/${bIds.memberId}/lock`, undefined],
      ["post", `/users/${bIds.memberId}/unlock`, undefined],
      ["post", `/users/${bIds.memberId}/force-password-reset`, undefined],
      ["get", `/users/${bIds.memberId}/sessions`, undefined],
      ["delete", `/users/${bIds.memberId}/sessions/${bIds.sessionId}`, undefined],
      ["get", `/users/${bIds.memberId}/security-events`, undefined],
      ["get", `/rbac/roles/${bIds.roleId}`, undefined],
      ["put", `/rbac/roles/${bIds.roleId}`, { description: "pwn" }],
      ["delete", `/rbac/roles/${bIds.roleId}`, undefined],
      ["get", `/rbac/roles/${bIds.roleId}/permissions`, undefined],
      ["get", `/rbac/roles/${bIds.roleId}/policies`, undefined],
      ["post", `/rbac/roles/${bIds.roleId}/permissions`, { permissionNames: ["bdocs:read"] }],
      ["get", `/rbac/permissions/${bIds.permissionId}`, undefined],
      ["put", `/rbac/permissions/${bIds.permissionId}`, { description: "pwn" }],
      ["delete", `/rbac/permissions/${bIds.permissionId}`, undefined],
      ["get", `/rbac/policies/${bIds.policyId}`, undefined],
      ["put", `/rbac/policies/${bIds.policyId}`, { description: "pwn" }],
      ["delete", `/rbac/policies/${bIds.policyId}`, undefined],
      ["get", `/rbac/groups/${bIds.groupId}`, undefined],
      ["put", `/rbac/groups/${bIds.groupId}`, { description: "pwn" }],
      ["delete", `/rbac/groups/${bIds.groupId}`, undefined],
      ["post", `/rbac/groups/${bIds.groupId}/members/${bIds.memberId}`, undefined],
      ["get", `/rbac/users/${bIds.memberId}/roles`, undefined],
      ["get", `/rbac/users/${bIds.memberId}/permissions`, undefined],
      ["post", `/rbac/users/${bIds.memberId}/roles`, { roleNames: ["admin"] }],
      ["put", `/rbac/users/${bIds.memberId}/roles`, { roleNames: ["owner"] }],
      ["delete", `/rbac/users/${bIds.ownerId}/roles/owner`, undefined],
      ["delete", `/sessions/${bIds.sessionId}`, undefined],
    ];

    it("returns 403/404 with no B data, and B is unchanged", async () => {
      for (const [verb, path, body] of cases()) {
        const req = (aOwner as unknown as Record<Verb, (p: string) => import("supertest").Test>)[verb](path);
        const res = body ? await req.send(body) : await req;
        // Listing a foreign user's sessions yields an empty list (schema-scoped), never B's rows.
        const emptyOk = res.status === 200 && /\/(sessions|security-events|roles|permissions|policies)$/.test(path) && !JSON.stringify(res.body).includes(b.tenantId);
        expect({ verb, path, status: emptyOk || [400, 403, 404, 409].includes(res.status) ? "ok" : res.status }).toEqual({ verb, path, status: "ok" });
        const text = JSON.stringify(res.body);
        expect(text).not.toContain(bMember.email);
        expect(text).not.toContain("b-only");
        expect(text).not.toContain(b.admin.email);
      }
      // B is untouched.
      expect((await bOwner.get(`/users/${bIds.memberId}`)).body.data.firstName).not.toBe("Hijacked");
      expect((await bOwner.get(`/rbac/roles/${bIds.roleId}`)).status).toBe(200);
      expect((await bOwner.get(`/rbac/permissions/${bIds.permissionId}`)).status).toBe(200);
      expect((await bOwner.get(`/rbac/policies/${bIds.policyId}`)).status).toBe(200);
      expect((await bOwner.get(`/rbac/groups/${bIds.groupId}`)).status).toBe(200);
      expect((await as(t, b.slug, bMember.accessToken).get("/users/me")).status).toBe(200);
      const memberRoles = await bOwner.get(`/rbac/users/${bIds.memberId}/roles`);
      expect(JSON.stringify(memberRoles.body)).toContain('"member"');
      expect(JSON.stringify(memberRoles.body)).not.toContain('"owner"');
      expect(JSON.stringify((await bOwner.get(`/rbac/users/${bIds.ownerId}/roles`)).body)).toContain('"owner"');
    });

    it("list endpoints only ever contain the caller's tenant", async () => {
      for (const p of ["/users", "/rbac/roles", "/rbac/policies", "/rbac/groups", "/rbac/permissions", "/audit", "/users/export", "/sessions/active"]) {
        const res = await aOwner.get(p);
        expect(res.status).toBe(200);
        const text = typeof res.text === "string" ? res.text : JSON.stringify(res.body);
        expect(text).not.toContain(bMember.email);
        expect(text).not.toContain(b.admin.email);
        expect(text).not.toContain("b-only");
        expect(text).not.toContain(b.tenantId);
      }
    });

    it("A's owner cannot assign B's role or policy to an A user", async () => {
      const r = await aOwner.post(`/rbac/users/${aMember.id}/roles`).send({ roleNames: ["b-only-role"] });
      expect(r.status).toBeGreaterThanOrEqual(400);
      const pol = await aOwner.post(`/rbac/roles/${await roleIdOf(t, a, "member")}/policies/${bIds.policyId}`);
      expect(pol.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("token <-> tenant binding", () => {
    it("A's token against B's slug header, x-tenant-id header (uuid and slug) and subdomain is TENANT_MISMATCH", async () => {
      const bad = [
        t.http({ tenant: b.slug, bearer: a.admin.accessToken }),
        t.http({ bearer: a.admin.accessToken, headers: { "x-tenant-id": b.tenantId } }),
        t.http({ bearer: a.admin.accessToken, headers: { "x-tenant-id": b.slug } }),
        t.http({ bearer: a.admin.accessToken, headers: { host: `${b.slug}.auth.test` } }),
      ];
      for (const c of bad) {
        for (const p of ["/users/me", "/users", "/rbac/roles", "/audit", "/mfa/status", "/sessions/active", "/tenants/current", "/dashboard"]) {
          const res = await c.get(p);
          expect([401, 403]).toContain(res.status);
          expect({ p, code: res.body.code }).toEqual({ p, code: expect.stringMatching(/TENANT_MISMATCH|AUTH_TOKEN_INVALID|ACCESS_FORBIDDEN/) });
          expect(JSON.stringify(res.body)).not.toContain(b.admin.email);
        }
      }
      const res = await t.http({ tenant: b.slug, bearer: a.admin.accessToken }).get("/users/me");
      expect(res.body.code).toBe("TENANT_MISMATCH");
    });

    it("the reverse direction is also refused", async () => {
      const res = await t.http({ tenant: a.slug, bearer: b.admin.accessToken }).get("/users");
      expect(res.body.code).toBe("TENANT_MISMATCH");
    });

    it("the access-token cookie is bound to the tenant as well", async () => {
      const res = await t.http({ tenant: b.slug, cookies: a.admin.cookies }).get("/users/me");
      expect([401, 403]).toContain(res.status);
    });

    it("a subdomain host wins over a conflicting slug header and still enforces binding", async () => {
      const res = await t.http({ tenant: a.slug, bearer: a.admin.accessToken, headers: { host: `${b.slug}.auth.test` } }).get("/users/me");
      expect([401, 403]).toContain(res.status);
    });

    it("a payload with tampered tid (signature no longer valid) is rejected", async () => {
      const [h, , s] = a.admin.accessToken.split(".");
      const claims = { ...decodeJwt(a.admin.accessToken), tenantId: b.tenantId, tid: b.tenantId };
      const forged = `${h}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${s}`;
      for (const slug of [a.slug, b.slug]) {
        expect((await as(t, slug, forged).get("/users/me")).status).toBe(401);
      }
    });

    it("alg=none and an HS256 token signed with a guessable secret are rejected", async () => {
      const claims = { ...decodeJwt(a.admin.accessToken) };
      const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`;
      expect((await as(t, a.slug, none).get("/users/me")).status).toBe(401);
      const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const sig = createHmac("sha256", "e2e-jwt-secret-e2e-jwt-secret-e2e-jwt-secret").update(`${head}.${body}`).digest("base64url");
      expect((await as(t, a.slug, `${head}.${body}.${sig}`).get("/users/me")).status).toBe(401);
    });

    it("a validly signed token (A's key) that claims B's tenant is refused on both hosts", async () => {
      const c = withoutTimes(decodeJwt(a.admin.accessToken));
      const token = await mintToken(t, a.tenantId, { ...c, tenantId: b.tenantId, tenantSlug: b.slug });
      for (const slug of [a.slug, b.slug]) {
        const res = await as(t, slug, token).get("/users/me");
        expect([401, 403]).toContain(res.status);
        expect(JSON.stringify(res.body)).not.toContain(b.admin.email);
      }
    });

    it("a token signed with B's key but claiming tenant A is refused", async () => {
      const c = withoutTimes(decodeJwt(bMember.accessToken));
      const token = await mintToken(t, b.tenantId, { ...c, tenantId: a.tenantId, tenantSlug: a.slug });
      const res = await as(t, a.slug, token).get("/users/me");
      expect([401, 403]).toContain(res.status);
    });

    it("a token without a tenant claim is refused", async () => {
      const c = decodeJwt(a.admin.accessToken);
      const token = await mintToken(t, a.tenantId, { sub: c["sub"], email: c["email"], sessionId: c["sessionId"] });
      expect([401, 403]).toContain((await as(t, a.slug, token).get("/users/me")).status);
    });

    it("tenant-role names cannot grant superadmin: a 'groups' claim on a tenant token does not unlock cross-tenant access", async () => {
      const c = withoutTimes(decodeJwt(a.admin.accessToken));
      const token = await mintToken(t, a.tenantId, { ...c, groups: ["owner"] });
      expect((await as(t, b.slug, token).get("/users")).status).toBeGreaterThanOrEqual(401);
    });

    it("a refresh cookie from A cannot mint a session on B", async () => {
      const refresh = a.admin.cookies.find((x) => x.startsWith("refreshToken="));
      if (!refresh) return;
      const res = await t.http({ tenant: b.slug, cookies: [refresh] }).post("/auth/refresh").send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("login with A's credentials on B's tenant fails", async () => {
      const res = await loginUser(t, b, a.admin.email, a.admin.password);
      expect(res.res.status).toBe(401);
    });
  });

  describe("shared email addresses across tenants stay separate", () => {
    it("the same email can exist in both tenants with independent roles", async () => {
      const shared = `shared-${Date.now()}@e2e.example.com`;
      const inA = await aOwner.post("/users/invite").send({ email: shared, roleIds: [await roleIdOf(t, a, "admin")] });
      const inB = await bOwner.post("/users/invite").send({ email: shared, roleIds: [await roleIdOf(t, b, "member")] });
      expect(inA.status).toBe(201);
      expect(inB.status).toBe(201);
    });
  });

  describe("search_path hygiene on pooled connections", () => {
    it("failing requests do not leak a tenant schema into later requests", async () => {
      // A fresh client (fresh client IP) per call keeps the per-IP rate limiter out of the picture.
      const A = () => as(t, a.slug, a.admin.accessToken);
      const B = () => as(t, b.slug, b.admin.accessToken);
      const failing: Array<() => Promise<unknown>> = [
        () => A().get("/users/not-a-uuid"),
        () => A().get(`/rbac/roles/${bIds.roleId}`),
        () => A().post("/rbac/roles").send({}),
        () => A().post("/users/invite").send({ email: "bad" }),
        () => t.http({ tenant: a.slug, bearer: b.admin.accessToken }).get("/users/me"),
        () => t.http({ tenant: "no-such-tenant-xyz" }).get("/tenants/current"),
        () => t.http({ tenant: b.slug }).get("/users/me"),
      ];
      for (let round = 0; round < 6; round++) {
        for (const f of failing) await f();
        expect((await A().get("/users/me")).body.data.email).toBe(a.admin.email);
        expect((await B().get("/users/me")).body.data.email).toBe(b.admin.email);
        expect((await A().get("/tenants/current")).body.data.slug).toBe(a.slug);
        expect((await B().get("/tenants/current")).body.data.slug).toBe(b.slug);
      }
    });

    it("interleaved concurrent requests from both tenants (including failures) never see each other's data", async () => {
      // The test app already listens on one real socket for its whole lifetime.
      const base = (await t.app.getUrl()).replace("[::1]", "127.0.0.1");
      const call = (own: TenantFixture, path: string) =>
        request(base).get(path).set("x-tenant-slug", own.slug).set("authorization", `Bearer ${own.admin.accessToken}`).set("x-forwarded-for", `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`);
      const jobs: Array<Promise<void>> = [];
      for (let i = 0; i < 40; i++) {
        const useA = i % 2 === 0;
        const own = useA ? a : b;
        const other = useA ? b : a;
        jobs.push(
          (async () => {
            if (i % 3 === 0) await call(own, `/rbac/roles/${useA ? bIds.roleId : "00000000-0000-4000-8000-000000000000"}`);
            if (i % 4 === 0) await call(own, "/users/not-a-uuid");
            const users = await call(own, "/users");
            expect(users.status).toBe(200);
            const text = JSON.stringify(users.body);
            expect(text).toContain(own.admin.email);
            expect(text).not.toContain(other.admin.email);
            expect((await call(own, "/tenants/current")).body.data.slug).toBe(own.slug);
          })(),
        );
      }
      await Promise.all(jobs);
    });

    it("no pooled connection is left with a tenant search_path after the load", async () => {
      const rows = await t.db.query("SHOW search_path");
      expect(String(rows[0].search_path)).not.toMatch(/fk_/);
    });
  });

  describe("tenant lifecycle isolation", () => {
    it("suspending A does not affect B", async () => {
      const c1 = await createTenant(t);
      const c2 = await createTenant(t);
      await t.db.query("UPDATE public.tenants SET active = false WHERE id = $1", [c1.tenantId]);
      await t.app.get(TenantService).invalidateCache(c1.tenantId);
      expect([401, 403, 404]).toContain((await as(t, c1.slug, c1.admin.accessToken).get("/users/me")).status);
      expect((await as(t, c2.slug, c2.admin.accessToken).get("/users/me")).status).toBe(200);
    });
  });
});
