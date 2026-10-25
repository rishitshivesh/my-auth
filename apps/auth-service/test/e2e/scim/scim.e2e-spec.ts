import { createTestApp, createTenant, type TestApp, type TenantFixture } from "../support";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const NIL = "00000000-0000-0000-0000-000000000000";

describe("SCIM 2.0", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  let tokenA: string;
  let tokenB: string;
  let tokenAId: string;

  const admin = (tn: TenantFixture) => t.http({ tenant: tn.slug, bearer: tn.admin.accessToken });
  const scimA = () => t.http({ tenant: a.slug, bearer: tokenA });
  const scimB = () => t.http({ tenant: b.slug, bearer: tokenB });
  const schemaOf = (slug: string): string => `fk_${slug.replace(/-/g, "_")}`;
  let seq = 0;
  const email = (p = "scim"): string => `${p}-${Date.now()}-${seq++}@scim.example.com`;
  const newUser = (userName = email(), over: Record<string, unknown> = {}) => ({
    schemas: [USER_SCHEMA],
    userName,
    name: { givenName: "Sam", familyName: "Scim" },
    displayName: "Sam Scim",
    active: true,
    ...over,
  });
  const patchOps = (...Operations: Record<string, unknown>[]) => ({ schemas: [PATCH_SCHEMA], Operations });
  const expectScimError = (res: { status: number; body: Record<string, unknown> }, status: number): void => {
    expect(res.status).toBe(status);
    expect(res.body.schemas).toEqual([ERROR_SCHEMA]);
    expect(res.body.status).toBe(String(status));
    expect(typeof res.body.detail).toBe("string");
  };

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
    const ca = await admin(a).post("/scim/tokens").send({ name: "okta" });
    expect(ca.status).toBe(201);
    tokenA = ca.body.data.token;
    tokenAId = ca.body.data.record.id;
    tokenB = (await admin(b).post("/scim/tokens").send({ name: "okta" })).body.data.token;
  });
  afterAll(() => t.close());

  describe("token management", () => {
    it("requires an authenticated admin", async () => {
      expect((await t.http({ tenant: a.slug }).post("/scim/tokens").send({ name: "x" })).status).toBe(401);
      expect((await t.http({ tenant: a.slug }).get("/scim/tokens")).status).toBe(401);
      expect((await t.http({ tenant: a.slug }).delete(`/scim/tokens/${tokenAId}`)).status).toBe(401);
    });

    it("returns the raw token once, stores only its hash, and never lists it", async () => {
      expect(tokenA).toMatch(/^scim_[0-9a-f]{64}$/);
      const list = await admin(a).get("/scim/tokens");
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).not.toContain(tokenA);
      const rows = await t.db.query(`SELECT token_hash FROM "${schemaOf(a.slug)}".scim_tokens`);
      for (const r of rows) expect(r.token_hash).not.toBe(tokenA);
    });

    it("rejects a SCIM token as a management credential and vice versa", async () => {
      expect((await t.http({ tenant: a.slug, bearer: tokenA }).get("/scim/tokens")).status).toBe(401);
      expect((await t.http({ tenant: a.slug, bearer: a.admin.accessToken }).get("/scim/v2/Users")).status).toBe(401);
    });

    it("cannot revoke another tenant's token; revoked tokens stop working", async () => {
      const mine = await admin(a).post("/scim/tokens").send({ name: "temp" });
      const id = mine.body.data.record.id as string;
      const raw = mine.body.data.token as string;
      expect((await admin(b).delete(`/scim/tokens/${id}`)).status).toBe(404);
      expect((await t.http({ tenant: a.slug, bearer: raw }).get("/scim/v2/Users")).status).toBe(200);
      expect((await admin(a).delete(`/scim/tokens/${id}`)).status).toBe(204);
      expectScimError(await t.http({ tenant: a.slug, bearer: raw }).get("/scim/v2/Users"), 401);
    });

    it("honours token expiry", async () => {
      const r = await admin(a).post("/scim/tokens").send({ name: "short", expiresInDays: 1 });
      await t.db.query(`UPDATE "${schemaOf(a.slug)}".scim_tokens SET expires_at = now() - interval '1 hour' WHERE id=$1`, [r.body.data.record.id]);
      expectScimError(await t.http({ tenant: a.slug, bearer: r.body.data.token }).get("/scim/v2/Users"), 401);
    });
  });

  describe("authentication", () => {
    it.each([["no header", undefined], ["wrong scheme", "Basic abc"], ["garbage", "Bearer nope"], ["empty bearer", "Bearer "]])(
      "rejects %s with a SCIM 401 and challenge",
      async (_n, header) => {
        const req = t.http({ tenant: a.slug }).get("/scim/v2/Users");
        if (header) req.set("authorization", header);
        const res = await req;
        expectScimError(res, 401);
        expect(res.headers["www-authenticate"]).toMatch(/Bearer/);
      },
    );

    it("a tenant-B token is useless against tenant A", async () => {
      expectScimError(await t.http({ tenant: a.slug, bearer: tokenB }).get("/scim/v2/Users"), 401);
    });

    it("every v2 route is protected", async () => {
      const routes: Array<["get" | "post" | "put" | "patch" | "delete", string]> = [
        ["get", "/scim/v2/Users"], ["post", "/scim/v2/Users"], ["get", "/scim/v2/Users/x"], ["put", "/scim/v2/Users/x"],
        ["patch", "/scim/v2/Users/x"], ["delete", "/scim/v2/Users/x"], ["get", "/scim/v2/Groups"], ["post", "/scim/v2/Groups"],
        ["get", "/scim/v2/Groups/x"], ["patch", "/scim/v2/Groups/x"], ["delete", "/scim/v2/Groups/x"], ["get", "/scim/v2/ServiceProviderConfig"],
      ];
      for (const [m, p] of routes) {
        const res = await t.http({ tenant: a.slug })[m](p).send({});
        expect(res.status).toBe(401);
      }
    });
  });

  describe("ServiceProviderConfig", () => {
    it("advertises capabilities in SCIM shape (unwrapped)", async () => {
      const res = await scimA().get("/scim/v2/ServiceProviderConfig");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/scim\+json/);
      expect(res.body.schemas).toContain("urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig");
      expect(res.body.patch.supported).toBe(true);
    });
  });

  describe("Users", () => {
    it("creates, reads, replaces, patches and deletes a user", async () => {
      const userName = email();
      const created = await scimA().post("/scim/v2/Users").send(newUser(userName));
      expect(created.status).toBe(201);
      expect(created.headers["content-type"]).toMatch(/application\/scim\+json/);
      expect(created.body).toMatchObject({ schemas: [USER_SCHEMA], userName, active: true, name: { givenName: "Sam", familyName: "Scim" } });
      expect(created.body.meta.resourceType).toBe("User");
      expect(created.body.meta.location).toContain(`/scim/v2/Users/${created.body.id}`);
      const id = created.body.id as string;

      const got = await scimA().get(`/scim/v2/Users/${id}`);
      expect(got.status).toBe(200);
      expect(got.body.userName).toBe(userName);

      const put = await scimA().put(`/scim/v2/Users/${id}`).send(newUser(userName, { displayName: "Renamed", name: { givenName: "New", familyName: "Name" } }));
      expect(put.status).toBe(200);
      expect(put.body.displayName).toBe("Renamed");
      expect(put.body.name.givenName).toBe("New");

      const off = await scimA().patch(`/scim/v2/Users/${id}`).send(patchOps({ op: "replace", path: "active", value: false }));
      expect(off.status).toBe(200);
      expect(off.body.active).toBe(false);
      const on = await scimA().patch(`/scim/v2/Users/${id}`).send(patchOps({ op: "replace", value: { active: true } }));
      expect(on.body.active).toBe(true);
      const rename = await scimA().patch(`/scim/v2/Users/${id}`).send(patchOps({ op: "replace", path: "displayName", value: "Patched" }));
      expect(rename.body.displayName).toBe("Patched");

      expect((await scimA().delete(`/scim/v2/Users/${id}`)).status).toBe(204);
      expectScimError(await scimA().get(`/scim/v2/Users/${id}`), 404);
    });

    it("returns 409 uniqueness on duplicate userName", async () => {
      const userName = email();
      await scimA().post("/scim/v2/Users").send(newUser(userName));
      const dup = await scimA().post("/scim/v2/Users").send(newUser(userName));
      expectScimError(dup, 409);
      expect(dup.body.scimType).toBe("uniqueness");
    });

    it("validates payloads with a SCIM error body", async () => {
      const res = await scimA().post("/scim/v2/Users").send({ schemas: [USER_SCHEMA] });
      expect(res.status).toBe(400);
      expect(res.body.schemas).toEqual([ERROR_SCHEMA]);
      const notEmail = await scimA().post("/scim/v2/Users").send(newUser("not-an-email"));
      expect(notEmail.status).toBe(400);
      expect(notEmail.body.schemas).toEqual([ERROR_SCHEMA]);
    });

    it("404s with SCIM errors for unknown and malformed ids", async () => {
      expectScimError(await scimA().get(`/scim/v2/Users/${NIL}`), 404);
      const bad = await scimA().get("/scim/v2/Users/not-a-uuid");
      expect([400, 404]).toContain(bad.status);
      expect(bad.body.schemas).toEqual([ERROR_SCHEMA]);
      expectScimError(await scimA().put(`/scim/v2/Users/${NIL}`).send(newUser()), 404);
      expectScimError(await scimA().delete(`/scim/v2/Users/${NIL}`), 404);
    });

    it("rejects malformed PATCH bodies", async () => {
      const u = (await scimA().post("/scim/v2/Users").send(newUser())).body.id as string;
      const res = await scimA().patch(`/scim/v2/Users/${u}`).send(patchOps({ op: "explode", path: "active", value: 1 }));
      expect(res.status).toBe(400);
      expect(res.body.schemas).toEqual([ERROR_SCHEMA]);
      const none = await scimA().patch(`/scim/v2/Users/${u}`).send({ schemas: [PATCH_SCHEMA] });
      expect(none.status).toBe(400);
    });

    it("ignores attempts to mass-assign privileged fields", async () => {
      const userName = email();
      const res = await scimA().post("/scim/v2/Users").send(newUser(userName, { id: "00000000-0000-0000-0000-000000000001", tenantId: b.tenantId, isSuperAdmin: true, roles: ["owner"], password: "x" }));
      expect(res.status).toBe(201);
      expect(res.body.id).not.toBe("00000000-0000-0000-0000-000000000001");
      const rows = await t.db.query(`SELECT tenant_id FROM "${schemaOf(a.slug)}".users WHERE email=$1`, [userName]);
      expect(rows[0].tenant_id).toBe(a.tenantId);
    });

    it("lists with pagination and ListResponse shape", async () => {
      for (let i = 0; i < 3; i++) await scimA().post("/scim/v2/Users").send(newUser());
      const page1 = await scimA().get("/scim/v2/Users?startIndex=1&count=2");
      expect(page1.status).toBe(200);
      expect(page1.body.schemas).toEqual([LIST_SCHEMA]);
      expect(page1.body.Resources).toHaveLength(2);
      expect(page1.body.itemsPerPage).toBe(2);
      expect(page1.body.totalResults).toBeGreaterThanOrEqual(4);
      const page2 = await scimA().get("/scim/v2/Users?startIndex=3&count=2");
      const ids1 = page1.body.Resources.map((r: { id: string }) => r.id);
      for (const r of page2.body.Resources) expect(ids1).not.toContain(r.id);
    });

    it("clamps or rejects absurd pagination parameters", async () => {
      for (const q of ["count=0", "count=-5", "startIndex=0", "startIndex=-1", "count=abc", "count=1000000"]) {
        const res = await scimA().get(`/scim/v2/Users?${q}`);
        expect([200, 400]).toContain(res.status);
        if (res.status === 200) expect(res.body.Resources.length).toBeLessThanOrEqual(200);
      }
    });

    it("filters by userName eq and returns an empty list when nothing matches", async () => {
      const userName = email("filter");
      await scimA().post("/scim/v2/Users").send(newUser(userName));
      const hit = await scimA().get("/scim/v2/Users").query({ filter: `userName eq "${userName}"` });
      expect(hit.status).toBe(200);
      expect(hit.body.totalResults).toBe(1);
      expect(hit.body.Resources[0].userName).toBe(userName);
      const miss = await scimA().get("/scim/v2/Users").query({ filter: 'userName eq "nobody@scim.example.com"' });
      expect(miss.body.totalResults).toBe(0);
      expect(miss.body.Resources).toEqual([]);
    });

    it("is not injectable through filter and never widens results", async () => {
      const total = (await scimA().get("/scim/v2/Users")).body.totalResults as number;
      const payloads = [
        `userName eq "x" or userName pr`,
        `userName eq "x" OR 1=1`,
        `userName eq "' OR '1'='1"`,
        `userName eq "a"; SELECT pg_sleep(5);--`,
        `userName eq "x" or active eq true`,
        `userName co ""`,
        `(`,
        `userName eq`,
        `userName eq "unterminated`,
      ];
      for (const filter of payloads) {
        const res = await scimA().get("/scim/v2/Users").query({ filter });
        expect([200, 400]).toContain(res.status);
        if (res.status === 200) expect(res.body.totalResults).toBeLessThan(total);
        else expect(res.body.schemas).toEqual([ERROR_SCHEMA]);
      }
      expect((await scimA().get("/scim/v2/Users")).body.totalResults).toBe(total);
    });

    it("unsupported filters are not silently ignored (would return every user)", async () => {
      const total = (await scimA().get("/scim/v2/Users")).body.totalResults as number;
      const res = await scimA().get("/scim/v2/Users").query({ filter: 'displayName eq "Definitely Nobody"' });
      if (res.status === 200) expect(res.body.totalResults).toBeLessThan(total);
      else expect(res.status).toBe(400);
    });
  });

  describe("tenant isolation", () => {
    it("tenant B cannot read, modify, delete or list tenant A's users", async () => {
      const userName = email("iso");
      const id = (await scimA().post("/scim/v2/Users").send(newUser(userName))).body.id as string;
      expectScimError(await scimB().get(`/scim/v2/Users/${id}`), 404);
      expectScimError(await scimB().put(`/scim/v2/Users/${id}`).send(newUser(userName)), 404);
      expectScimError(await scimB().patch(`/scim/v2/Users/${id}`).send(patchOps({ op: "replace", path: "active", value: false })), 404);
      expectScimError(await scimB().delete(`/scim/v2/Users/${id}`), 404);
      const list = await scimB().get("/scim/v2/Users").query({ filter: `userName eq "${userName}"` });
      expect(list.body.totalResults).toBe(0);
      expect((await scimA().get(`/scim/v2/Users/${id}`)).body.active).toBe(true);
    });

    it("the same userName can exist independently in two tenants", async () => {
      const userName = email("both");
      expect((await scimA().post("/scim/v2/Users").send(newUser(userName))).status).toBe(201);
      expect((await scimB().post("/scim/v2/Users").send(newUser(userName))).status).toBe(201);
    });

    it("groups are isolated, and foreign users cannot be added to a group", async () => {
      const g = await scimA().post("/scim/v2/Groups").send({ schemas: [GROUP_SCHEMA], displayName: "A-only" });
      expect(g.status).toBe(201);
      expectScimError(await scimB().get(`/scim/v2/Groups/${g.body.id}`), 404);
      expectScimError(await scimB().delete(`/scim/v2/Groups/${g.body.id}`), 404);
      const foreign = (await scimB().post("/scim/v2/Users").send(newUser())).body.id as string;
      const res = await scimA().patch(`/scim/v2/Groups/${g.body.id}`).send(patchOps({ op: "add", path: "members", value: [{ value: foreign }] }));
      if (res.status === 200) {
        expect(res.body.members.map((m: { value: string }) => m.value)).not.toContain(foreign);
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body.schemas).toEqual([ERROR_SCHEMA]);
      }
    });
  });

  describe("Groups", () => {
    it("creates with members, lists, patches membership and displayName, and deletes", async () => {
      const u1 = (await scimA().post("/scim/v2/Users").send(newUser())).body.id as string;
      const u2 = (await scimA().post("/scim/v2/Users").send(newUser())).body.id as string;
      const created = await scimA().post("/scim/v2/Groups").send({ schemas: [GROUP_SCHEMA], displayName: "Engineering", members: [{ value: u1 }] });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ schemas: [GROUP_SCHEMA], displayName: "Engineering" });
      expect(created.body.members.map((m: { value: string }) => m.value)).toEqual([u1]);
      const gid = created.body.id as string;

      const list = await scimA().get("/scim/v2/Groups?count=100");
      expect(list.body.schemas).toEqual([LIST_SCHEMA]);
      expect(list.body.Resources.map((g: { id: string }) => g.id)).toContain(gid);

      const patch = (op: Record<string, unknown>) => scimA().patch(`/scim/v2/Groups/${gid}`).send(patchOps(op));
      const added = await patch({ op: "add", path: "members", value: [{ value: u2 }] });
      expect(added.body.members.map((m: { value: string }) => m.value).sort()).toEqual([u1, u2].sort());
      const dupAdd = await patch({ op: "add", path: "members", value: [{ value: u2 }] });
      expect(dupAdd.body.members).toHaveLength(2);
      const removed = await patch({ op: "remove", path: "members", value: [{ value: u1 }] });
      expect(removed.body.members.map((m: { value: string }) => m.value)).toEqual([u2]);
      const replaced = await patch({ op: "replace", path: "members", value: [{ value: u1 }] });
      expect(replaced.body.members.map((m: { value: string }) => m.value)).toEqual([u1]);
      const renamed = await patch({ op: "replace", path: "displayName", value: "Platform" });
      expect(renamed.body.displayName).toBe("Platform");

      expect((await scimA().delete(`/scim/v2/Groups/${gid}`)).status).toBe(204);
      expectScimError(await scimA().get(`/scim/v2/Groups/${gid}`), 404);
      expect((await scimA().get(`/scim/v2/Users/${u1}`)).status).toBe(200);
    });

    it("validates group payloads and unknown ids", async () => {
      const bad = await scimA().post("/scim/v2/Groups").send({ schemas: [GROUP_SCHEMA] });
      expect(bad.status).toBe(400);
      expect(bad.body.schemas).toEqual([ERROR_SCHEMA]);
      expectScimError(await scimA().get(`/scim/v2/Groups/${NIL}`), 404);
      expectScimError(await scimA().patch(`/scim/v2/Groups/${NIL}`).send(patchOps({ op: "replace", path: "displayName", value: "x" })), 404);
      expectScimError(await scimA().delete(`/scim/v2/Groups/${NIL}`), 404);
    });

    it("rejects or drops members that are not existing users", async () => {
      const res = await scimA().post("/scim/v2/Groups").send({ schemas: [GROUP_SCHEMA], displayName: "ghosts", members: [{ value: "00000000-0000-0000-0000-0000000000aa" }] });
      if (res.status === 201) expect(res.body.members ?? []).toEqual([]);
      else expect(res.body.schemas).toEqual([ERROR_SCHEMA]);
    });
  });
});
