import { createTenant, createTestApp, extractLink, schemaOf, STRONG_PASSWORD, uniqueEmail, type TenantFixture, type TestApp } from "../support";
import { as } from "../_shared/fixtures";

describe("invitee-side request-new and accept hint", () => {
  let t: TestApp;
  let fx: TenantFixture;
  let other: TenantFixture;
  let owner: ReturnType<typeof as>;

  beforeAll(async () => {
    t = await createTestApp();
    fx = await createTenant(t);
    other = await createTenant(t);
    owner = as(t, fx.slug, fx.admin.accessToken);
  });
  afterAll(() => t.close());

  const tokenFor = (email: string): string => extractLink(t.mail.last(email, "invitation")!, "/invite/").split("/invite/")[1]!;
  const http = (slug = fx.slug) => t.http({ tenant: slug });

  it("an expired invite can be renewed by its holder: new link to the invited address, old one dead, cooldown applies", async () => {
    const email = uniqueEmail("renew");
    await owner.post("/users/invite").send({ email });
    const old = tokenFor(email);
    await t.db.query(`UPDATE "${schemaOf(fx.slug)}".user_invites SET expires_at = now() - interval '1 day' WHERE email = $1`, [email]);
    expect((await http().get(`/auth/invite/validate/${old}`)).body.code).toBe("LINK_EXPIRED");

    t.mail.clear();
    const res = await http().post("/auth/invite/request-new").send({ token: old });
    expect(res.status).toBe(200);
    expect(t.mail.allTo(email)).toHaveLength(1);
    const fresh = tokenFor(email);
    expect(fresh).not.toBe(old);
    expect((await http().get(`/auth/invite/validate/${fresh}`)).status).toBe(200);
    expect((await http().get(`/auth/invite/validate/${old}`)).status).toBeGreaterThanOrEqual(400);

    const again = await http().post("/auth/invite/request-new").send({ token: fresh });
    expect(again.status).toBe(429);
    expect(again.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(t.mail.allTo(email)).toHaveLength(1);
  });

  it("refuses unknown tokens, other tenants and accepted invites without sending mail", async () => {
    const email = uniqueEmail("done");
    await owner.post("/users/invite").send({ email });
    const token = tokenFor(email);
    t.mail.clear();
    expect((await http().post("/auth/invite/request-new").send({ token: "f".repeat(128) })).body.code).toBe("INVITE_INVALID");
    expect((await http(other.slug).post("/auth/invite/request-new").send({ token })).body.code).toBe("INVITE_INVALID");
    const acc = await http().post("/auth/invite/accept").send({ token, name: "Done Person", password: STRONG_PASSWORD });
    expect(acc.status).toBe(201);
    expect(acc.body.data.canSignInNow).toBe(true);
    const res = await http().post("/auth/invite/request-new").send({ token });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LINK_ALREADY_USED");
    expect(t.mail.all()).toHaveLength(0);
  });
});
