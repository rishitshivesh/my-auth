import {
  createTestApp,
  createTenant,
  extractLink,
  loginUser,
  tokenFromLink,
  uniqueEmail,
  STRONG_PASSWORD,
  type TenantFixture,
  type TestApp,
} from "../support";

describe("registration and email verification", () => {
  let t: TestApp;
  let tenant: TenantFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
  });
  afterAll(() => t.close());
  beforeEach(() => t.mail.clear());

  const register = (body: Record<string, unknown>, ip?: string) =>
    t.http({ tenant: tenant.slug, ip }).post("/auth/register").send(body);

  it("registers a user, wraps the response in the {status,data} envelope and mails a verification link", async () => {
    const email = uniqueEmail();
    const res = await register({ email, password: STRONG_PASSWORD, firstName: "Ada" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe(201);
    expect(res.body.data).toMatchObject({ email, firstName: "Ada" });
    expect(res.body.data.message).toMatch(/check your email/i);
    expect(JSON.stringify(res.body)).not.toContain(STRONG_PASSWORD);

    const mail = t.mail.last(email, "verify-email");
    expect(mail).toBeDefined();
    expect(extractLink(mail!, "/verify-email")).toContain("token=");
  });

  it("answers a duplicate registration exactly like a fresh one and sends no second mail", async () => {
    const email = uniqueEmail();
    const first = await register({ email, password: STRONG_PASSWORD, firstName: "Ada" });
    t.mail.clear();
    const second = await register({ email, password: STRONG_PASSWORD, firstName: "Ada" });

    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(t.mail.allTo(email)).toHaveLength(0);
  });

  it("rejects a weak password with 422 and a field error", async () => {
    const res = await register({ email: uniqueEmail(), password: "password" });
    expect(res.status).toBe(422);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.body.errors?.length).toBeGreaterThan(0);
    expect(res.body.errors[0]).toHaveProperty("field");
  });

  it("rejects an invalid email with 422", async () => {
    const res = await register({ email: "not-an-email", password: STRONG_PASSWORD });
    expect(res.status).toBe(422);
    expect(res.body.errors.some((e: { field: string }) => e.field === "email")).toBe(true);
  });

  it("verifies the email with the mailed token and lets the user log in", async () => {
    const email = uniqueEmail();
    await register({ email, password: STRONG_PASSWORD });
    const token = tokenFromLink(extractLink(t.mail.last(email, "verify-email")!, "/verify-email"));

    const res = await t.http({ tenant: tenant.slug }).post("/auth/verify-email").send({ token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 200, data: { message: expect.any(String) } });

    const login = await loginUser(t, tenant, email, STRONG_PASSWORD);
    expect(login.res.status).toBe(200);
    expect(login.res.body.data.user.emailVerified).toBe(true);
  });

  it("refuses a reused verification token", async () => {
    const email = uniqueEmail();
    await register({ email, password: STRONG_PASSWORD });
    const token = tokenFromLink(extractLink(t.mail.last(email, "verify-email")!, "/verify-email"));
    const http = t.http({ tenant: tenant.slug });

    expect((await http.post("/auth/verify-email").send({ token })).status).toBe(200);
    const again = await t.http({ tenant: tenant.slug }).post("/auth/verify-email").send({ token });
    expect(again.status).toBe(401);
    expect(again.body.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("refuses an expired verification token", async () => {
    const email = uniqueEmail();
    await register({ email, password: STRONG_PASSWORD });
    const token = tokenFromLink(extractLink(t.mail.last(email, "verify-email")!, "/verify-email"));
    await t.db.query(
      `UPDATE "fk_${tenant.slug.replace(/-/g, "_")}".users SET email_verification_expires_at = now() - interval '1 minute' WHERE email = $1`,
      [email],
    );

    const res = await t.http({ tenant: tenant.slug }).post("/auth/verify-email").send({ token });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("refuses an unknown verification token", async () => {
    const res = await t.http({ tenant: tenant.slug }).post("/auth/verify-email").send({ token: "f".repeat(64) });
    expect(res.status).toBe(401);
  });

  it("resend-verification is enumeration safe and issues a fresh token for unverified users", async () => {
    const email = uniqueEmail();
    await register({ email, password: STRONG_PASSWORD });
    t.mail.clear();

    const known = await t.http({ tenant: tenant.slug }).post("/auth/resend-verification").send({ email });
    const unknown = await t.http({ tenant: tenant.slug }).post("/auth/resend-verification").send({ email: uniqueEmail() });
    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
    expect(t.mail.allTo(email)).toHaveLength(1);
  });
});
