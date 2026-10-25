import {
  createTenant,
  createTestApp,
  loginUser,
  registerAndVerifyUser,
  schemaOf,
  uniqueEmail,
  STRONG_PASSWORD,
  type TenantFixture,
  type TestApp,
} from "../support";

describe("password login", () => {
  let t: TestApp;
  let tenant: TenantFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
  });
  afterAll(() => t.close());
  beforeEach(() => t.mail.clear());

  const post = (body: Record<string, unknown>, ip?: string) =>
    t.http({ tenant: tenant.slug, ip }).post("/auth/login").send(body);

  it("logs in with good credentials, sets httpOnly cookies and returns no token in the body", async () => {
    const user = await registerAndVerifyUser(t, tenant);
    const { res, cookies } = await loginUser(t, tenant, user.email, user.password);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(200);
    expect(res.body.data).toMatchObject({
      tenantSlug: tenant.slug,
      user: { email: user.email, emailVerified: true },
      expiresIn: 900,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken|passwordHash/);
    const access = cookies.find((c) => c.startsWith("accessToken="));
    const refresh = cookies.find((c) => c.startsWith("refreshToken="));
    expect(access).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Strict/i);
  });

  it("rejects a wrong password with 401 AUTH_INVALID_CREDENTIALS problem+json", async () => {
    const user = await registerAndVerifyUser(t, tenant);
    const res = await post({ email: user.email, password: "Wrong-password-123!" });
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ code: "AUTH_INVALID_CREDENTIALS", status: 401 });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("answers an unknown email exactly like a wrong password (same body shape and comparable timing)", async () => {
    const user = await registerAndVerifyUser(t, tenant);

    const t0 = Date.now();
    const wrong = await post({ email: user.email, password: "Wrong-password-123!" });
    const wrongMs = Date.now() - t0;
    const t1 = Date.now();
    const unknown = await post({ email: uniqueEmail("ghost"), password: "Wrong-password-123!" });
    const unknownMs = Date.now() - t1;

    expect(unknown.status).toBe(wrong.status);
    const strip = (b: Record<string, unknown>) => ({ ...b, requestId: undefined });
    expect(strip(unknown.body)).toEqual(strip(wrong.body));
    // Both paths pay for one Argon2 verification; allow generous jitter.
    expect(Math.abs(unknownMs - wrongMs)).toBeLessThan(Math.max(wrongMs, unknownMs) * 0.9 + 250);
  });

  it("rejects malformed bodies with 422 field errors", async () => {
    const res = await post({ email: "nope" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(
      expect.arrayContaining(["email", "password"]),
    );
  });

  it("handles an unverified account consistently with the tenant's verification policy", async () => {
    const email = uniqueEmail();
    await t.http({ tenant: tenant.slug }).post("/auth/register").send({ email, password: STRONG_PASSWORD });
    const res = await post({ email, password: STRONG_PASSWORD });

    const [{ flags }] = await t.db.query(`SELECT feature_flags AS flags FROM public.tenants WHERE slug = $1`, [tenant.slug]);
    if (flags?.emailVerificationRequired) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("AUTH_EMAIL_NOT_VERIFIED");
    } else {
      expect(res.status).toBe(200);
      expect(res.body.data.user.emailVerified).toBe(false);
    }
  });

  it("locks the account after 5 failures, even for the correct password, and mails the owner", async () => {
    const user = await registerAndVerifyUser(t, tenant);
    for (let i = 0; i < 5; i++) {
      const r = await post({ email: user.email, password: "Wrong-password-123!" });
      expect(r.status).toBe(401);
    }
    const locked = await post({ email: user.email, password: user.password });
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe("AUTH_ACCOUNT_LOCKED");
    expect(t.mail.allTo(user.email).some((m) => m.template === "account-locked")).toBe(true);

    // A wrong password on a locked account must NOT reveal the lock.
    const wrongWhileLocked = await post({ email: user.email, password: "Wrong-password-123!" });
    expect(wrongWhileLocked.status).toBe(401);
  });

  it("lets a user in again once the lock has expired", async () => {
    const user = await registerAndVerifyUser(t, tenant);
    for (let i = 0; i < 5; i++) await post({ email: user.email, password: "Wrong-password-123!" });
    await t.db.query(`UPDATE "${schemaOf(tenant.slug)}".users SET locked_until = now() - interval '1 minute' WHERE email = $1`, [user.email]);

    const res = await post({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
  });

  it("throttles by email across IPs: over the limit even the right password looks like a wrong one", async () => {
    const user = await registerAndVerifyUser(t, tenant);
    const resetLock = () =>
      t.db.query(`UPDATE "${schemaOf(tenant.slug)}".users SET failed_login_attempts = 0, locked_until = NULL WHERE email = $1`, [user.email]);

    for (let i = 0; i < 11; i++) {
      await post({ email: user.email, password: "Wrong-password-123!" }); // fresh random IP each time
      await resetLock();
    }
    const blocked = await post({ email: user.email, password: user.password });
    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe("AUTH_INVALID_CREDENTIALS");

    // Other accounts are unaffected.
    const other = await registerAndVerifyUser(t, tenant);
    expect((await post({ email: other.email, password: other.password })).status).toBe(200);
  });

  it("throttles by IP across emails", async () => {
    const user = await registerAndVerifyUser(t, tenant);
    const ip = "198.51.100.77";
    await post({ email: uniqueEmail("ghost"), password: "Wrong-password-123!" }, ip);
    const [key] = await t.redis.keys(`*throttle:login:*:ip:${ip}`);
    expect(key).toBeDefined();
    await t.redis.set(key!, "1000", "KEEPTTL");

    const blocked = await post({ email: user.email, password: user.password }, ip);
    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("route rate limit answers 429 with Retry-After and a problem+json body", async () => {
    const ip = "198.51.100.78";
    let last = await post({ email: uniqueEmail("ghost"), password: "x" }, ip);
    for (let i = 0; i < 10 && last.status !== 429; i++) {
      last = await post({ email: uniqueEmail("ghost"), password: "x" }, ip);
    }
    expect(last.status).toBe(429);
    expect(last.headers["retry-after"]).toBeDefined();
    expect(Number(last.headers["retry-after"])).toBeGreaterThan(0);
    expect(last.headers["content-type"]).toMatch(/application\/problem\+json/);
    expect(last.body).toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect(last.body.retryAfterSeconds).toBe(Number(last.headers["retry-after"]));
  });

  it("an unknown tenant is a 404 problem", async () => {
    const res = await t.http({ tenant: "no-such-tenant-xyz" }).post("/auth/login").send({ email: uniqueEmail(), password: "x" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TENANT_NOT_FOUND");
  });
});
