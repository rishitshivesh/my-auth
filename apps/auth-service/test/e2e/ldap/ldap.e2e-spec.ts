import * as os from "node:os";
import * as ldapjs from "ldapjs";
import { createTestApp, createTenant, type TestApp, type TenantFixture } from "../support";

// The installed @types/ldapjs does not export its request/response/callback types.
interface LdapBindRequest { dn: { toString(): string }; credentials: string }
interface LdapSearchRequest { filter: { toString(): string } }
interface LdapResponse { end(): void; send(entry: { dn: string; attributes: Record<string, unknown> }): void }
type LdapNext = (error?: unknown) => void;

const BASE_DN = "dc=example,dc=com";
const BIND_DN = `cn=admin,${BASE_DN}`;
const BIND_PW = "S3cret-bind-pw!";

interface DirEntry {
  uid: string;
  mail?: string;
  cn?: string;
  givenName?: string;
  sn?: string;
}

function lanAddress(): string | undefined {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return undefined;
}

const HOST = lanAddress();
const maybe = HOST ? describe : describe.skip;

maybe("LDAP connections and sync", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  let server: ldapjs.Server;
  let port: number;
  let entries: DirEntry[] = [];
  const seenFilters: string[] = [];
  const binds: string[] = [];

  const admin = (tn: TenantFixture) => t.http({ tenant: tn.slug, bearer: tn.admin.accessToken });
  const schemaOf = (slug: string): string => `fk_${slug.replace(/-/g, "_")}`;
  const body = (over: Record<string, unknown> = {}) => ({
    name: "corp",
    host: HOST,
    port,
    bindDn: BIND_DN,
    bindPassword: BIND_PW,
    baseDn: BASE_DN,
    useTls: false,
    firstNameAttribute: "gn", // ldapjs' in-process server drops "givenName" from search results
    ...over,
  });
  const create = async (over: Record<string, unknown> = {}): Promise<string> => {
    const res = await admin(a).post("/ldap/connections").send(body(over));
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };

  beforeAll(async () => {
    server = ldapjs.createServer();
    server.bind(BASE_DN, (req: LdapBindRequest, res: LdapResponse, next: LdapNext) => {
      binds.push(req.dn.toString());
      if (req.dn.toString() === BIND_DN && req.credentials === BIND_PW) {
        res.end();
        return next();
      }
      return next(new ldapjs.InvalidCredentialsError());
    });
    server.search(BASE_DN, (req: LdapSearchRequest, res: LdapResponse, next: LdapNext) => {
      seenFilters.push(req.filter.toString());
      for (const e of entries) {
        res.send({
          dn: `uid=${e.uid},${BASE_DN}`,
          attributes: {
            objectClass: ["inetOrgPerson"],
            ...(e.mail === undefined ? {} : { mail: e.mail }),
            ...(e.cn === undefined ? {} : { cn: e.cn }),
            ...(e.givenName === undefined ? {} : { gn: e.givenName }),
            ...(e.sn === undefined ? {} : { sn: e.sn }),
          },
        });
      }
      res.end();
      return next();
    });
    await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", () => resolve()));
    port = (server as unknown as { server: { address(): { port: number } } }).server.address().port;

    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await t.close();
  });

  describe("connection management", () => {
    it("requires authentication on every route", async () => {
      const h = () => t.http({ tenant: a.slug });
      expect((await h().get("/ldap/connections")).status).toBe(401);
      expect((await h().post("/ldap/connections").send(body())).status).toBe(401);
      expect((await h().patch("/ldap/connections/x").send({})).status).toBe(401);
      expect((await h().delete("/ldap/connections/x")).status).toBe(401);
      expect((await h().post("/ldap/connections/x/test")).status).toBe(401);
      expect((await h().post("/ldap/connections/x/sync")).status).toBe(401);
    });

    it("creates a connection without ever returning the bind password, defaulting to TLS", async () => {
      const res = await admin(a).post("/ldap/connections").send({ ...body(), useTls: undefined });
      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toContain(BIND_PW);
      expect(JSON.stringify(res.body)).not.toMatch(/bindPassword/i);
      expect(res.body.data.useTls).toBe(true);
      const list = await admin(a).get("/ldap/connections");
      expect(JSON.stringify(list.body)).not.toMatch(/bindPassword/i);
      const rows = await t.db.query(`SELECT bind_password_encrypted FROM "${schemaOf(a.slug)}".ldap_connections WHERE id=$1`, [res.body.data.id]);
      expect(rows[0].bind_password_encrypted).not.toContain(BIND_PW);
    });

    it("validates input", async () => {
      expect((await admin(a).post("/ldap/connections").send({ name: "x" })).status).toBe(422);
      expect((await admin(a).post("/ldap/connections").send(body({ port: 70000 }))).status).toBe(422);
    });

    it.each(["127.0.0.1", "localhost", "169.254.169.254", "::1", "127.1"])("refuses loopback/metadata host %s", async (host) => {
      const res = await admin(a).post("/ldap/connections").send(body({ host }));
      expect([400, 422]).toContain(res.status);
    });

    it("updates without leaking the password, re-encrypts a new one, and revalidates host", async () => {
      const id = await create();
      const upd = await admin(a).patch(`/ldap/connections/${id}`).send({ name: "renamed", bindPassword: "N3w-password!" });
      expect(upd.status).toBe(200);
      expect(upd.body.data.name).toBe("renamed");
      expect(JSON.stringify(upd.body)).not.toContain("N3w-password!");
      const bad = await admin(a).patch(`/ldap/connections/${id}`).send({ host: "169.254.169.254" });
      expect([400, 422]).toContain(bad.status);
    });

    it("is tenant isolated for list, update, delete, test and sync", async () => {
      const id = await create();
      expect((await admin(b).get("/ldap/connections")).body.data.map((c: { id: string }) => c.id)).not.toContain(id);
      expect((await admin(b).patch(`/ldap/connections/${id}`).send({ name: "x" })).status).toBe(404);
      expect((await admin(b).delete(`/ldap/connections/${id}`)).status).toBe(404);
      expect((await admin(b).post(`/ldap/connections/${id}/test`)).status).toBe(404);
      expect((await admin(b).post(`/ldap/connections/${id}/sync`)).status).toBe(404);
    });

    it("deletes a connection", async () => {
      const id = await create();
      expect((await admin(a).delete(`/ldap/connections/${id}`)).status).toBe(204);
      expect((await admin(a).delete(`/ldap/connections/${id}`)).status).toBe(404);
    });
  });

  describe("test endpoint", () => {
    it("binds successfully with correct credentials", async () => {
      const id = await create();
      const res = await admin(a).post(`/ldap/connections/${id}/test`);
      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ success: true, message: "Connection successful" });
    });

    it("reports bind failure without echoing the password", async () => {
      const id = await create({ bindPassword: "wrong-password" });
      const res = await admin(a).post(`/ldap/connections/${id}/test`);
      expect(res.body.data.success).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain("wrong-password");
    });

    it("reports an unreachable server as failure, not a crash", async () => {
      const id = await create({ port: 1 });
      const res = await admin(a).post(`/ldap/connections/${id}/test`);
      expect(res.status).toBeLessThan(500);
      expect(res.body.data.success).toBe(false);
    });
  });

  describe("sync", () => {
    it("creates users from the directory, then updates them on the next run", async () => {
      const mail = `ldap-${Date.now()}@corp.example.com`;
      entries = [{ uid: "u1", mail, cn: "First Person", givenName: "First", sn: "Person" }];
      const id = await create();
      const first = await admin(a).post(`/ldap/connections/${id}/sync`);
      expect(first.status).toBe(202);
      expect(first.body.data).toMatchObject({ usersCreated: 1, usersUpdated: 0, errors: [] });
      const rows = await t.db.query(`SELECT tenant_id, first_name, last_name, display_name, email_verified, is_active FROM "${schemaOf(a.slug)}".users WHERE email=$1`, [mail]);
      expect(rows[0]).toMatchObject({ tenant_id: a.tenantId, first_name: "First", last_name: "Person", display_name: "First Person", email_verified: true, is_active: true });

      entries = [{ uid: "u1", mail, cn: "Renamed Person", givenName: "Renamed", sn: "Person" }];
      const second = await admin(a).post(`/ldap/connections/${id}/sync`);
      expect(second.body.data).toMatchObject({ usersCreated: 0, usersUpdated: 1 });
      const after = await t.db.query(`SELECT first_name FROM "${schemaOf(a.slug)}".users WHERE email=$1`, [mail]);
      expect(after[0].first_name).toBe("Renamed");
      const conn = await t.db.query(`SELECT last_sync_status, last_sync_users_created, last_sync_users_updated FROM "${schemaOf(a.slug)}".ldap_connections WHERE id=$1`, [id]);
      expect(conn[0]).toMatchObject({ last_sync_status: "success", last_sync_users_updated: 1 });
    });

    it("keeps synced users inside the connection's tenant", async () => {
      const mail = `iso-${Date.now()}@corp.example.com`;
      entries = [{ uid: "iso", mail, cn: "Iso" }];
      await admin(a).post(`/ldap/connections/${await create()}/sync`);
      const inB = await t.db.query(`SELECT 1 FROM "${schemaOf(b.slug)}".users WHERE email=$1`, [mail]);
      expect(inB).toHaveLength(0);
    });

    it("skips entries without or with a malformed mail attribute and reports them", async () => {
      const good = `good-${Date.now()}@corp.example.com`;
      entries = [
        { uid: "nomail", cn: "No Mail" },
        { uid: "evil", mail: `<script>alert(1)</script>@x.example.com`, cn: "Evil" },
        { uid: "space", mail: "a b@corp.example.com", cn: "Space" },
        { uid: "plain", mail: "not-an-email", cn: "Plain" },
        { uid: "good", mail: good, cn: "Good" },
      ];
      const res = await admin(a).post(`/ldap/connections/${await create()}/sync`);
      expect(res.body.data.usersCreated).toBe(1);
      expect(res.body.data.errors.length).toBeGreaterThanOrEqual(3);
      const bad = await t.db.query(`SELECT 1 FROM "${schemaOf(a.slug)}".users WHERE email LIKE '%script%' OR email='not-an-email'`);
      expect(bad).toHaveLength(0);
    });

    it("fails the sync cleanly and records failure on bind error", async () => {
      const id = await create({ bindPassword: "nope" });
      const res = await admin(a).post(`/ldap/connections/${id}/sync`);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain("nope");
      const conn = await t.db.query(`SELECT last_sync_status FROM "${schemaOf(a.slug)}".ldap_connections WHERE id=$1`, [id]);
      expect(conn[0].last_sync_status).toBe("failed");
    });

    it("refuses to sync an inactive connection", async () => {
      const id = await create();
      await admin(a).patch(`/ldap/connections/${id}`).send({ active: false });
      expect((await admin(a).post(`/ldap/connections/${id}/sync`)).status).toBe(400);
    });

    it("sends the configured filter verbatim and a hostile filter cannot hang or crash the service", async () => {
      entries = [];
      seenFilters.length = 0;
      const id = await create({ userFilter: "(&(objectClass=inetOrgPerson)(uid=*))" });
      await admin(a).post(`/ldap/connections/${id}/sync`);
      expect(seenFilters.at(-1)).toContain("objectClass=inetOrgPerson");
      for (const userFilter of ["(((", "(uid=*)(uid=*", "\u0000", "(&(objectClass=*)"]) {
        const made = await admin(a).post("/ldap/connections").send(body({ userFilter }));
        if (made.status === 422) continue; // rejected at the boundary is fine
        expect(made.status).toBe(201);
        const hid = made.body.data.id as string;
        const started = Date.now();
        const res = await admin(a).post(`/ldap/connections/${hid}/sync`);
        expect(Date.now() - started).toBeLessThan(10000);
        expect([202, 400, 422, 500]).toContain(res.status);
      }
    });

    it("never injects directory values into a filter (email lookups are parameterised)", async () => {
      const victim = `victim-${Date.now()}@corp.example.com`;
      entries = [{ uid: "v", mail: victim, cn: "Victim" }];
      await admin(a).post(`/ldap/connections/${await create()}/sync`);
      entries = [{ uid: "x", mail: `${victim}' OR '1'='1`, cn: "Attacker" }];
      const res = await admin(a).post(`/ldap/connections/${await create()}/sync`);
      expect(res.body.data.usersUpdated).toBe(0);
      const v = await t.db.query(`SELECT display_name FROM "${schemaOf(a.slug)}".users WHERE email=$1`, [victim]);
      expect(v[0].display_name).toBe("Victim");
    });
  });
  describe("deprovisioning", () => {
    const stamp = Date.now();
    const person = (n: number, tag: string): DirEntry => ({
      uid: `${tag}${n}`,
      mail: `${tag}${n}-${stamp}@corp.example.com`,
      cn: `Person ${n}`,
      givenName: "P",
      sn: String(n),
    });
    const people = (count: number, tag: string): DirEntry[] => Array.from({ length: count }, (_, i) => person(i, tag));
    const state = async (email: string) =>
      (await t.db.query(`SELECT id, is_active, ldap_connection_id, ldap_deactivated_at FROM "${schemaOf(a.slug)}".users WHERE email=$1`, [email]))[0] as
        | { id: string; is_active: boolean; ldap_connection_id: string | null; ldap_deactivated_at: Date | null }
        | undefined;
    const events = async (type: string, userId: string) =>
      t.db.query(`SELECT 1 FROM "${schemaOf(a.slug)}".security_events WHERE event_type=$1 AND user_id=$2`, [type, userId]);
    const sync = async (id: string) => (await admin(a).post(`/ldap/connections/${id}/sync`)).body.data as Record<string, unknown>;
    const waitFor = async <T,>(fn: () => Promise<T | undefined>, ms = 5000): Promise<T> => {
      const end = Date.now() + ms;
      for (;;) {
        const v = await fn();
        if (v !== undefined) return v;
        if (Date.now() > end) throw new Error("timed out");
        await new Promise((r) => setTimeout(r, 100));
      }
    };

    it("deactivates (never deletes) users that left the directory, only those the connection provisioned, and reactivates them on return", async () => {
      const all = people(10, "dp");
      entries = all;
      const id = await create();
      expect(await sync(id)).toMatchObject({ usersCreated: 10, usersDeactivated: 0, aborted: false });

      // A local account that happens to be absent from the directory must be left alone.
      const local = `local-${stamp}@corp.example.com`;
      await t.db.query(
        `INSERT INTO "${schemaOf(a.slug)}".users (tenant_id, email, email_verified, is_active, primary_auth_method) VALUES ($1,$2,true,true,'password')`,
        [a.tenantId, local],
      );

      const gone = all[3]!;
      entries = all.filter((e) => e !== gone);
      const res = await sync(id);
      expect(res).toMatchObject({ usersDeactivated: 1, aborted: false });

      const row = await state(gone.mail!);
      expect(row).toMatchObject({ is_active: false, ldap_connection_id: id });
      expect(row!.ldap_deactivated_at).toBeTruthy();
      expect((await state(local))!.is_active).toBe(true);
      expect((await state(all[0]!.mail!))!.is_active).toBe(true);
      await waitFor(async () => ((await events("ldap.user_deactivated", row!.id)).length ? true : undefined));

      // Returns to the directory: reactivated by the same connection.
      entries = all;
      expect(await sync(id)).toMatchObject({ usersReactivated: 1, usersDeactivated: 0 });
      expect(await state(gone.mail!)).toMatchObject({ is_active: true, ldap_deactivated_at: null });
      await waitFor(async () => ((await events("ldap.user_reactivated", row!.id)).length ? true : undefined));

      // An admin-disabled LDAP user (not disabled by sync) is not silently re-enabled.
      await t.db.query(`UPDATE "${schemaOf(a.slug)}".users SET is_active=false WHERE email=$1`, [all[5]!.mail]);
      await sync(id);
      expect((await state(all[5]!.mail!))!.is_active).toBe(false);
    });

    it("aborts without changing anything when more than the allowed share would be deactivated", async () => {
      const all = people(5, "sv");
      entries = all;
      const id = await create();
      await sync(id);

      entries = all.slice(0, 3); // 2 of 5 = 40% > 20%
      const res = await sync(id);
      expect(res).toMatchObject({ aborted: true, usersDeactivated: 0, usersCreated: 0, usersUpdated: 0 });
      expect(String((res["errors"] as string[])[0])).toMatch(/LDAP_MAX_DEACTIVATE_PERCENT/);
      for (const e of all) expect((await state(e.mail!))!.is_active).toBe(true);
      const conn = await t.db.query(`SELECT last_sync_status FROM "${schemaOf(a.slug)}".ldap_connections WHERE id=$1`, [id]);
      expect(conn[0].last_sync_status).toBe("aborted");
      await waitFor(async () => ((await t.db.query(`SELECT 1 FROM "${schemaOf(a.slug)}".security_events WHERE event_type='ldap.sync_aborted' AND resource_id=$1`, [id])).length ? true : undefined));

      // An empty directory (e.g. a broken filter) is the extreme case.
      entries = [];
      expect(await sync(id)).toMatchObject({ aborted: true });
      for (const e of all) expect((await state(e.mail!))!.is_active).toBe(true);
    });

    it("never deactivates users that another connection provisioned", async () => {
      const mine = people(5, "iso1");
      const theirs = people(5, "iso2");
      entries = theirs;
      const other = await create();
      await sync(other);

      entries = mine;
      const id = await create();
      await sync(id);
      entries = mine.slice(0, 5); // theirs is absent from this connection's directory
      expect(await sync(id)).toMatchObject({ usersDeactivated: 0, aborted: false });
      for (const e of theirs) expect((await state(e.mail!))!.is_active).toBe(true);
    });
  });
});
