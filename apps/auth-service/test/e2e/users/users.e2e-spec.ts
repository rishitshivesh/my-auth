import { createTestApp, createTenant, uniqueEmail, STRONG_PASSWORD, extractLink, loginUser, type TenantFixture, type TestApp } from "../support";
import { addMember, adminUserId, as, auditItems, decodeJwt, roleIdOf, type Member } from "../_shared/fixtures";

const inviteToken = (t: TestApp, email: string): string =>
  extractLink(t.mail.last(email)!, "/invite/").split("/invite/")[1]!;

describe("users", () => {
  let t: TestApp;
  let fx: TenantFixture;
  let member: Member;
  let owner: ReturnType<typeof as>;

  beforeAll(async () => {
    t = await createTestApp();
    fx = await createTenant(t);
    owner = as(t, fx.slug, fx.admin.accessToken);
    member = await addMember(t, fx, "member");
  });
  afterAll(async () => {
    await t.close();
  });

  describe("own profile", () => {
    it("GET /users/me returns the profile without secrets", async () => {
      const res = await as(t, fx.slug, member.accessToken).get("/users/me");
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(member.email);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/);
    });

    it("PUT /users/me updates the profile and rejects invalid fields", async () => {
      const ok = await as(t, fx.slug, member.accessToken).put("/users/me").send({ firstName: "Renamed" });
      expect(ok.status).toBe(200);
      const me = await as(t, fx.slug, member.accessToken).get("/users/me");
      expect(me.body.data.firstName).toBe("Renamed");
      const bad = await as(t, fx.slug, member.accessToken).put("/users/me").send({ firstName: 12345 });
      expect(bad.status).toBe(422);
    });

    it("PUT /users/me cannot change tenant, email or activation (mass assignment)", async () => {
      await as(t, fx.slug, member.accessToken).put("/users/me").send({ tenantId: "x", isActive: false, email: "evil@x.com" });
      const me = await as(t, fx.slug, member.accessToken).get("/users/me");
      expect(me.body.data.email).toBe(member.email);
      expect(me.body.data.isActive).not.toBe(false);
    });

    it("GET /users/orgs and /users/me/security-events respond", async () => {
      expect((await as(t, fx.slug, member.accessToken).get("/users/orgs")).status).toBe(200);
      expect((await as(t, fx.slug, member.accessToken).get("/users/me/security-events")).status).toBe(200);
    });

    it("401 without a token", async () => {
      expect((await t.http({ tenant: fx.slug }).get("/users/me")).status).toBe(401);
    });
  });

  describe("change password", () => {
    it("rejects wrong current and weak new password, accepts valid, old password stops working", async () => {
      const m = await addMember(t, fx, "member");
      const c = as(t, fx.slug, m.accessToken);
      const wrong = await c.post("/users/me/change-password").send({ currentPassword: "Wrong-password-1!", newPassword: "N3w-Passw0rd!-Zebra" });
      expect(wrong.status).toBeGreaterThanOrEqual(400);
      expect(wrong.status).toBeLessThan(500);
      const weak = await c.post("/users/me/change-password").send({ currentPassword: m.password, newPassword: "password" });
      expect(weak.status).toBeGreaterThanOrEqual(400);
      const ok = await c.post("/users/me/change-password").send({ currentPassword: m.password, newPassword: "N3w-Passw0rd!-Zebra" });
      expect(ok.status).toBe(200);
      expect((await loginUser(t, fx, m.email, m.password)).res.status).toBe(401);
      expect((await loginUser(t, fx, m.email, "N3w-Passw0rd!-Zebra")).res.status).toBe(200);
    });
  });

  describe("own sessions", () => {
    it("lists, revokes one and revokes all sessions", async () => {
      const m = await addMember(t, fx, "member");
      const second = await loginUser(t, fx, m.email, m.password);
      const c = as(t, fx.slug, m.accessToken);
      expect((await c.get("/users/me/sessions")).status).toBe(200);
      expect((await as(t, fx.slug, second.accessToken).get("/users/me")).status).toBe(200);
      const sid = decodeJwt(second.accessToken)["sessionId"] as string;
      expect((await c.delete(`/users/me/sessions/${sid}`)).status).toBe(200);
      expect((await as(t, fx.slug, second.accessToken).get("/users/me")).status).toBe(401);
      expect((await c.delete("/users/me/sessions")).status).toBe(200);
    });

    it("cannot revoke another user's session", async () => {
      const a = await addMember(t, fx, "member");
      const b = await addMember(t, fx, "member");
      const sidB = decodeJwt(b.accessToken)["sessionId"] as string;
      const res = await as(t, fx.slug, a.accessToken).delete(`/users/me/sessions/${sidB}`);
      expect([403, 404]).toContain(res.status);
      expect((await as(t, fx.slug, b.accessToken).get("/users/me")).status).toBe(200);
    });
  });

  describe("admin user management", () => {
    it("lists/searches users; members get 403", async () => {
      expect((await owner.get("/users?limit=1")).status).toBe(200);
      const search = await owner.get(`/users?search=${encodeURIComponent(member.email)}`);
      expect(search.status).toBe(200);
      expect(JSON.stringify(search.body)).toContain(member.email);
      expect((await as(t, fx.slug, member.accessToken).get("/users")).status).toBe(403);
    });

    it("stats and CSV export; export is permission-gated", async () => {
      expect((await owner.get("/users/stats")).status).toBe(200);
      const exp = await owner.get("/users/export");
      expect(exp.status).toBe(200);
      expect(exp.headers["content-type"]).toMatch(/text\/csv/);
      expect((await as(t, fx.slug, member.accessToken).get("/users/export")).status).toBe(403);
    });

    it("get/update/lock/unlock/force-reset/bulk status", async () => {
      const m = await addMember(t, fx, "member");
      expect((await owner.get(`/users/${m.id}`)).status).toBe(200);
      expect((await owner.put(`/users/${m.id}`).send({ firstName: "ByAdmin" })).status).toBe(200);
      expect((await owner.post(`/users/${m.id}/lock`)).status).toBe(200);
      expect((await loginUser(t, fx, m.email, m.password)).res.status).toBeGreaterThanOrEqual(400);
      expect((await owner.post(`/users/${m.id}/unlock`)).status).toBe(200);
      expect((await loginUser(t, fx, m.email, m.password)).res.status).toBe(200);
      expect((await owner.post(`/users/${m.id}/force-password-reset`)).status).toBe(200);
      expect((await owner.post("/users/bulk/update-status").send({ userIds: [m.id], isActive: false })).status).toBe(200);
      expect((await loginUser(t, fx, m.email, m.password)).res.status).toBeGreaterThanOrEqual(400);
      expect((await owner.post("/users/bulk/update-status").send({ userIds: [m.id], isActive: true })).status).toBe(200);
      const ev = (await auditItems(t, fx)).map((i) => i.eventType).join(",");
      expect(ev).toMatch(/user\.deactivated/);
    });

    it("per-user sessions and security events; admin session revoke kills the session", async () => {
      const m = await addMember(t, fx, "member");
      expect((await owner.get(`/users/${m.id}/sessions`)).status).toBe(200);
      const sid = decodeJwt(m.accessToken)["sessionId"] as string;
      expect((await owner.delete(`/users/${m.id}/sessions/${sid}`)).status).toBe(204);
      expect((await as(t, fx.slug, m.accessToken).get("/users/me")).status).toBe(401);
      expect((await owner.get(`/users/${m.id}/security-events`)).status).toBe(200);
    });

    it("DELETE /users/:id removes the user; members get 403; unknown id 404", async () => {
      const m = await addMember(t, fx, "member");
      const other = await addMember(t, fx, "member");
      expect((await as(t, fx.slug, other.accessToken).delete(`/users/${m.id}`)).status).toBe(403);
      expect((await owner.delete(`/users/${m.id}`)).status).toBe(204);
      expect((await loginUser(t, fx, m.email, m.password)).res.status).toBeGreaterThanOrEqual(400);
      const gone = await owner.get(`/users/${m.id}`);
      expect(gone.status === 404 || gone.body.data?.status === "deleted").toBe(true);
      expect((await owner.delete("/users/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    });

    it("non-uuid ids do not 500", async () => {
      expect((await owner.get("/users/not-a-uuid")).status).toBeLessThan(500);
    });

    it("an admin cannot delete, lock or edit the owner (hierarchy)", async () => {
      const admin = await addMember(t, fx, "admin");
      const ownerId = adminUserId(fx);
      const c = as(t, fx.slug, admin.accessToken);
      expect((await c.delete(`/users/${ownerId}`)).status).toBe(403);
      expect((await c.post(`/users/${ownerId}/lock`)).status).toBe(403);
      expect((await c.put(`/users/${ownerId}`).send({ firstName: "Pwned" })).status).toBe(403);
    });

  });

  describe("invites", () => {
    it("create -> validate -> accept (single use) -> login", async () => {
      const email = uniqueEmail("inv");
      const roleId = await roleIdOf(t, fx, "member");
      expect((await owner.post("/users/invite").send({ email, roleIds: [roleId] })).status).toBe(201);
      const token = inviteToken(t, email);
      const v = await t.http({ tenant: fx.slug }).get(`/auth/invite/validate/${token}`);
      expect(v.status).toBe(200);
      expect(JSON.stringify(v.body)).toContain(email);
      const acc = await t.http({ tenant: fx.slug }).post("/auth/invite/accept").send({ token, name: "Inv Ited", password: STRONG_PASSWORD });
      expect(acc.status).toBe(201);
      const again = await t.http({ tenant: fx.slug }).post("/auth/invite/accept").send({ token, name: "Inv Ited", password: STRONG_PASSWORD });
      expect(again.status).toBeGreaterThanOrEqual(400);
      expect((await loginUser(t, fx, email, STRONG_PASSWORD)).res.status).toBe(200);
    });

    it("lists pending invites without tokens, revokes one (audited, link dies), and is tenant-scoped", async () => {
      const email = uniqueEmail("rev");
      await owner.post("/users/invite").send({ email });
      const token = inviteToken(t, email);

      const list = await owner.get("/users/invites");
      expect(list.status).toBe(200);
      const items = (list.body.data ?? list.body) as Array<{ id: string; email: string }>;
      const mine = items.find((i) => i.email === email)!;
      expect(mine).toBeDefined();
      expect(JSON.stringify(list.body)).not.toContain(token);
      expect(Object.keys(mine)).not.toContain("token");

      // members cannot revoke; another tenant cannot see or revoke it
      expect((await as(t, fx.slug, member.accessToken).delete(`/users/invites/${mine.id}`)).status).toBe(403);
      const other = await createTenant(t);
      const otherOwner = as(t, other.slug, other.admin.accessToken);
      expect((await otherOwner.delete(`/users/invites/${mine.id}`)).status).toBe(404);
      expect(JSON.stringify((await otherOwner.get("/users/invites")).body)).not.toContain(email);

      expect((await owner.delete(`/users/invites/${mine.id}`)).status).toBe(204);
      expect((await owner.delete(`/users/invites/${mine.id}`)).status).toBe(404);
      const acc = await t.http({ tenant: fx.slug }).post("/auth/invite/accept").send({ token, name: "Re Voked", password: STRONG_PASSWORD });
      expect(acc.status).toBeGreaterThanOrEqual(400);
      expect((await t.http({ tenant: fx.slug }).get(`/auth/invite/validate/${token}`)).status).toBeGreaterThanOrEqual(400);
      expect((await auditItems(t, fx)).map((i) => i.eventType)).toContain("user.invite_revoked");
      // the address can be invited again
      expect((await owner.post("/users/invite").send({ email })).status).toBe(201);
    });

    it("an accepted invite cannot be revoked", async () => {
      const email = uniqueEmail("acc");
      await owner.post("/users/invite").send({ email });
      const token = inviteToken(t, email);
      await t.http({ tenant: fx.slug }).post("/auth/invite/accept").send({ token, name: "Acc Epted", password: STRONG_PASSWORD });
      const id = (await t.db.query(`SELECT id FROM "fk_${fx.slug.replace(/-/g, "_")}".user_invites WHERE email = $1`, [email]))[0].id as string;
      expect((await owner.delete(`/users/invites/${id}`)).status).toBe(409);
    });

    it("duplicate pending invite and existing user are conflicts", async () => {
      const email = uniqueEmail("dup");
      expect((await owner.post("/users/invite").send({ email })).status).toBe(201);
      expect((await owner.post("/users/invite").send({ email })).status).toBe(409);
      expect((await owner.post("/users/invite").send({ email: member.email })).status).toBe(409);
    });

    it("expired invite is refused", async () => {
      const email = uniqueEmail("exp");
      await owner.post("/users/invite").send({ email });
      const token = inviteToken(t, email);
      await t.db.query(`UPDATE "fk_${fx.slug.replace(/-/g, "_")}".user_invites SET expires_at = now() - interval '1 day' WHERE email = $1`, [email]);
      const acc = await t.http({ tenant: fx.slug }).post("/auth/invite/accept").send({ token, name: "X Y", password: STRONG_PASSWORD });
      expect(acc.status).toBe(400);
      expect((await t.http({ tenant: fx.slug }).get(`/auth/invite/validate/${token}`)).status).toBeGreaterThanOrEqual(400);
    });

    it("unknown token and weak password are refused", async () => {
      const bad = await t.http({ tenant: fx.slug }).post("/auth/invite/accept").send({ token: "f".repeat(128), name: "A B", password: STRONG_PASSWORD });
      expect(bad.status).toBe(400);
      const email = uniqueEmail("weak");
      await owner.post("/users/invite").send({ email });
      const weak = await t.http({ tenant: fx.slug }).post("/auth/invite/accept").send({ token: inviteToken(t, email), name: "A B", password: "password1" });
      expect(weak.status).toBeGreaterThanOrEqual(400);
    });

    it("an admin cannot invite as owner (privilege escalation)", async () => {
      const admin = await addMember(t, fx, "admin");
      const ownerRole = await roleIdOf(t, fx, "owner");
      const res = await as(t, fx.slug, admin.accessToken).post("/users/invite").send({ email: uniqueEmail("esc"), roleIds: [ownerRole] });
      expect(res.status).toBe(403);
    });

    it("invite with a role id from another tenant is rejected", async () => {
      const other = await createTenant(t);
      const foreign = await roleIdOf(t, other, "member");
      const res = await owner.post("/users/invite").send({ email: uniqueEmail("x"), roleIds: [foreign] });
      expect(res.status).toBe(400);
    });

    it("an invite for tenant A accepted via tenant B host never creates a B account", async () => {
      const other = await createTenant(t);
      const email = uniqueEmail("cross");
      await owner.post("/users/invite").send({ email });
      const token = inviteToken(t, email);
      const acc = await t.http({ tenant: other.slug }).post("/auth/invite/accept").send({ token, name: "A B", password: STRONG_PASSWORD });
      expect((await loginUser(t, other, email, STRONG_PASSWORD)).res.status).toBe(401);
      if (acc.status === 201) {
        expect((await loginUser(t, fx, email, STRONG_PASSWORD)).res.status).toBe(200);
      }
    });

    it("members cannot invite (403)", async () => {
      const res = await as(t, fx.slug, member.accessToken).post("/users/invite").send({ email: uniqueEmail("nope") });
      expect(res.status).toBe(403);
    });
  });

  describe("last owner", () => {
    it("the sole owner cannot delete their own account", async () => {
      const solo = await createTenant(t);
      const c = as(t, solo.slug, solo.admin.accessToken);
      const own = await c.delete("/users/me").send({ password: solo.admin.password });
      expect(own.status).toBe(409);
      expect((await c.get("/users/me")).status).toBe(200);
    });
  });
});
