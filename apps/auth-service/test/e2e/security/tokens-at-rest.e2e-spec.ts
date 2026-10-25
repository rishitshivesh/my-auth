import { createHash } from "node:crypto";
import { STRONG_PASSWORD, createTenant, createTestApp, extractLink, tokenFromLink, uniqueEmail, type TenantFixture, type TestApp } from "../support";

const sha = (v: string): string => createHash("sha256").update(v).digest("hex");

describe("security: single-use tokens are hashed at rest; dev-only endpoints closed", () => {
  let t: TestApp;
  let a: TenantFixture;
  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
  });
  afterAll(() => t.close());
  const schema = (): string => `fk_${a.slug.replace(/-/g, "_")}`;

  it("email verification token is stored as sha256 and the emailed raw token still verifies", async () => {
    const email = uniqueEmail();
    const reg = await t.http({ tenant: a.slug }).post("/auth/register").send({ email, password: STRONG_PASSWORD, firstName: "E2E" });
    expect(reg.status).toBe(201);
    const raw = tokenFromLink(extractLink(t.mail.last(email, "verify-email")!, "/verify-email"));
    const rows = await t.db.query(`SELECT email_verification_token AS tok FROM "${schema()}".users WHERE email = $1`, [email]);
    expect(rows[0].tok).toBe(sha(raw));
    expect(rows[0].tok).not.toBe(raw);

    // The stored digest itself must not work as a credential.
    const bad = await t.http({ tenant: a.slug }).post("/auth/verify-email").send({ token: rows[0].tok });
    expect(bad.status).toBe(401);
    const ok = await t.http({ tenant: a.slug }).post("/auth/verify-email").send({ token: raw });
    expect(ok.status).toBe(200);
    const again = await t.http({ tenant: a.slug }).post("/auth/verify-email").send({ token: raw });
    expect(again.status).toBe(401);
  });

  it("invite token is stored as sha256, validates via the raw token, and the digest is not accepted", async () => {
    const email = uniqueEmail("invitee");
    const inv = await t.http({ tenant: a.slug, bearer: a.admin.accessToken }).post("/users/invite").send({ email });
    expect(inv.status).toBe(201);
    const raw = tokenFromLink(extractLink(t.mail.last(email, "invitation")!, "/invite/")) ||
      new URL(extractLink(t.mail.last(email, "invitation")!, "/invite/")).pathname.split("/").pop()!;
    const rows = await t.db.query(`SELECT token FROM "${schema()}".user_invites WHERE email = $1`, [email]);
    expect(rows[0].token).toBe(sha(raw));
    expect((await t.http({ tenant: a.slug }).get(`/auth/invite/validate/${raw}`)).status).toBe(200);
    expect((await t.http({ tenant: a.slug }).get(`/auth/invite/validate/${rows[0].token}`)).status).toBeGreaterThanOrEqual(400);
  });

  it("GET /email/test is closed outside NODE_ENV=development", async () => {
    const res = await t.http({ tenant: a.slug }).get("/email/test").query({ type: "welcome", to: "x@e2e.example.com" });
    expect(res.status).toBe(403);
  });
});
