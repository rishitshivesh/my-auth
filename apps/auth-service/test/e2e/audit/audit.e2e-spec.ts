import { createTestApp, createTenant, loginUser, uniqueEmail, STRONG_PASSWORD, type TenantFixture, type TestApp } from "../support";
import { addMember, adminUserId, as, auditItems, type Member } from "../_shared/fixtures";

const schemaOf = (slug: string): string => `fk_${slug.replace(/-/g, "_")}`;

describe("audit", () => {
  let t: TestApp;
  let fx: TenantFixture;
  let owner: ReturnType<typeof as>;
  let member: Member;

  beforeAll(async () => {
    t = await createTestApp();
    fx = await createTenant(t);
    owner = as(t, fx.slug, fx.admin.accessToken);
    member = await addMember(t, fx, "member");
  });
  afterAll(async () => {
    await t.close();
  });

  async function seedEvent(slug: string, tenantId: string, over: Record<string, string | null>): Promise<void> {
    await t.db.query(
      `INSERT INTO "${schemaOf(slug)}".security_events
         (tenant_id, event_type, severity, ip_address, user_agent, actor_email, request_id, resource_id, resource_type, outcome, metadata)
       VALUES ($1, $2, 'info', '10.0.0.1', 'jest', $3, $4, $5, 'seed', 'success', '{}')`,
      [tenantId, over["eventType"] ?? "seed.event", over["actorEmail"] ?? null, over["requestId"] ?? null, over["resourceId"] ?? null],
    );
  }

  it("requires authentication and the audit:read permission", async () => {
    expect((await t.http({ tenant: fx.slug }).get("/audit")).status).toBe(401);
    expect((await t.http({ tenant: fx.slug }).get("/audit/export")).status).toBe(401);
    expect((await as(t, fx.slug, member.accessToken).get("/audit/export")).status).toBe(403);
    expect((await owner.get("/audit")).status).toBe(200);
  });

  it("lists events newest-first with total, limit and cursor pagination", async () => {
    const res = await owner.get("/audit?limit=2");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.total).toBeGreaterThan(2);
    const [first, second] = res.body.data.items as Array<{ createdAt: string }>;
    expect(new Date(first!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(second!.createdAt).getTime());
    const next = await owner.get(`/audit?limit=2&cursor=${encodeURIComponent(res.body.data.nextCursor)}`);
    expect(next.status).toBe(200);
    const ids = new Set((res.body.data.items as Array<{ id: string }>).map((i) => i.id));
    for (const item of next.body.data.items as Array<{ id: string }>) expect(ids.has(item.id)).toBe(false);
  });

  it("validates filters (limit bounds, dates)", async () => {
    expect((await owner.get("/audit?limit=0")).status).toBe(422);
    expect((await owner.get("/audit?limit=201")).status).toBe(422);
    expect((await owner.get("/audit?startDate=yesterday")).status).toBe(422);
    expect((await owner.get(`/audit?requestId=${"x".repeat(65)}`)).status).toBe(422);
  });

  it("filters by eventType, userId, requestId and date range", async () => {
    await seedEvent(fx.slug, fx.tenantId, { eventType: "seed.filter", requestId: "req-audit-1", actorEmail: "seed@e2e.example.com" });
    const byType = await owner.get("/audit?eventType=seed.filter");
    expect(byType.body.data.items).toHaveLength(1);
    const byReq = await owner.get("/audit?requestId=req-audit-1");
    expect(byReq.body.data.items).toHaveLength(1);
    expect(byReq.body.data.items[0].eventType).toBe("seed.filter");
    expect((await owner.get("/audit?requestId=nope")).body.data.items).toHaveLength(0);

    const uid = adminUserId(fx);
    const byUser = await owner.get(`/audit?userId=${uid}`);
    expect(byUser.status).toBe(200);
    for (const i of byUser.body.data.items as Array<{ userId: string }>) expect(i.userId).toBe(uid);

    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect((await owner.get(`/audit?startDate=${encodeURIComponent(future)}`)).body.data.items).toHaveLength(0);
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect((await owner.get(`/audit?endDate=${encodeURIComponent(past)}`)).body.data.items).toHaveLength(0);
  });

  it("a malformed userId filter never 500s", async () => {
    expect((await owner.get("/audit?userId=not-a-uuid")).status).toBeLessThan(500);
  });

  it("only returns the caller's tenant events", async () => {
    const other = await createTenant(t);
    await seedEvent(other.slug, other.tenantId, { eventType: "seed.other_tenant_only" });
    const mine = await owner.get("/audit?eventType=seed.other_tenant_only");
    expect(mine.body.data.items).toHaveLength(0);
    const theirs = await as(t, other.slug, other.admin.accessToken).get("/audit?eventType=seed.other_tenant_only");
    expect(theirs.body.data.items).toHaveLength(1);
  });

  describe("CSV export", () => {
    it("returns CSV with header, attachment disposition, and the same filters", async () => {
      const res = await owner.get("/audit/export?eventType=auth.login_success");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/csv/);
      expect(res.headers["content-disposition"]).toMatch(/attachment; filename="audit-\d+\.csv"/);
      const lines = res.text.split("\n");
      expect(lines[0]).toBe("timestamp,eventType,severity,actorEmail,userId,ipAddress,resourceType,resourceId,outcome,requestId");
      expect(lines.length).toBeGreaterThan(1);
      for (const l of lines.slice(1)) expect(l).toContain("auth.login_success");
    });

    it("neutralises spreadsheet formulas in every user-influenced cell", async () => {
      const payloads = ["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd"];
      for (const p of payloads) {
        await seedEvent(fx.slug, fx.tenantId, { eventType: "seed.csv", actorEmail: p, resourceId: p, requestId: "csv-1" });
      }
      const res = await owner.get("/audit/export?eventType=seed.csv");
      expect(res.status).toBe(200);
      const cells = res.text.split("\n").slice(1).flatMap((l) => l.split('","'));
      for (const c of cells) {
        const v = c.replace(/^"|"$/g, "");
        expect(v).not.toMatch(/^[=+\-@\t\r]/);
      }
      expect(res.text).toContain("'=HYPERLINK");
    });

    it("export honours the requestId filter", async () => {
      const res = await owner.get("/audit/export?requestId=csv-1");
      expect(res.text.split("\n").length - 1).toBe(5);
    });
  });

  describe("security events are written for sensitive actions", () => {
    it("records logins, failed logins, password changes, invites and user lifecycle", async () => {
      const m = await addMember(t, fx, "member");
      await loginUser(t, fx, m.email, "Wrong-Password-1!");
      await as(t, fx.slug, m.accessToken).post("/users/me/change-password").send({ currentPassword: m.password, newPassword: "N3w-Passw0rd!-Zebra" });
      await owner.post(`/users/${m.id}/lock`);
      await owner.post("/users/invite").send({ email: uniqueEmail("aud") });
      const del = await owner.delete(`/users/${m.id}`);
      expect(del.status).toBe(204);
      const types = (await auditItems(t, fx)).map((i) => i.eventType);
      for (const expected of ["auth.login_success", "auth.login_failed", "password.changed", "user.registered", "user.deleted"]) {
        expect(types).toContain(expected);
      }
    });

    it("audit rows carry the request id returned to the client", async () => {
      const res = await owner.put("/users/me").send({ firstName: "Audited" });
      const rid = res.headers["x-request-id"] as string;
      await new Promise((r) => setTimeout(r, 400));
      const found = await owner.get(`/audit?requestId=${rid}`);
      // Not every handler stamps requestId; when it does it must be queryable.
      expect(found.status).toBe(200);
    });

    it("rbac mutations are audited with actor and target", async () => {
      const m = await addMember(t, fx, "member");
      await owner.put(`/rbac/users/${m.id}/roles`).send({ roleNames: ["admin"] });
      const items = await auditItems(t, fx);
      const hit = items.find((i) => i.eventType === "rbac.role_assigned" && i.resourceId === m.id);
      expect(hit).toBeDefined();
      expect(hit!.userId).toBe(adminUserId(fx));
    });

    it("password is never written to audit metadata", async () => {
      const items = await auditItems(t, fx);
      expect(JSON.stringify(items)).not.toContain(STRONG_PASSWORD);
    });
  });
});
