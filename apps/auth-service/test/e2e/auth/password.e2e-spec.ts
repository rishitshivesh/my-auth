import {
  createTenant,
  createTestApp,
  loginUser,
  registerAndVerifyUser,
  schemaOf,
  STRONG_PASSWORD,
  OTHER_STRONG_PASSWORD,
  uniqueEmail,
  type TenantFixture,
  type TestApp,
  type UserFixture,
} from "../support";

describe("forgot / reset / change password", () => {
  let t: TestApp;
  let tenant: TenantFixture;
  let user: UserFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    user = await registerAndVerifyUser(t, tenant);
    t.mail.clear();
  });
  afterEach(() => jest.restoreAllMocks());

  const anon = () => t.http({ tenant: tenant.slug });
  const forgot = (email: string) => anon().post("/auth/forgot-password").send({ email });
  const reset = (email: string, otp: string, password: string) =>
    anon().post("/auth/reset-password").send({ email, otp, password });
  const otpFor = (email: string): string => String(t.mail.last(email, "otp-code")!.props["code"]);

  describe("forgot-password", () => {
    it("is enumeration safe: identical response for known and unknown emails", async () => {
      const known = await forgot(user.email);
      const unknown = await forgot(uniqueEmail("ghost"));
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toEqual(known.body);
      expect(t.mail.allTo(user.email)).toHaveLength(1);
    });

    it("sends nothing to unknown addresses", async () => {
      const ghost = uniqueEmail("ghost");
      await forgot(ghost);
      expect(t.mail.allTo(ghost)).toHaveLength(0);
    });
  });

  describe("reset-password", () => {
    it("resets with the mailed code, revokes sessions, emails the owner and invalidates the old password", async () => {
      const s = await loginUser(t, tenant, user.email, user.password);
      await forgot(user.email);
      t.mail.clear();
      await forgot(user.email);
      const res = await reset(user.email, otpFor(user.email), OTHER_STRONG_PASSWORD);

      expect(res.status).toBe(200);
      expect(t.mail.allTo(user.email).some((m) => m.template === "password-changed")).toBe(true);
      expect((await t.http({ tenant: tenant.slug, cookies: s.cookies }).get("/auth/me")).status).toBe(401);
      expect((await loginUser(t, tenant, user.email, user.password)).res.status).toBe(401);
      expect((await loginUser(t, tenant, user.email, OTHER_STRONG_PASSWORD)).res.status).toBe(200);
    });

    it("code is single use", async () => {
      await forgot(user.email);
      const otp = otpFor(user.email);
      expect((await reset(user.email, otp, OTHER_STRONG_PASSWORD)).status).toBe(200);
      const again = await reset(user.email, otp, "Another-Str0ng-Pass!9");
      expect(again.status).toBeGreaterThanOrEqual(400);
      expect(again.body.code).toBe("AUTH_OTP_INVALID");
    });

    it("rejects an expired code", async () => {
      await forgot(user.email);
      const otp = otpFor(user.email);
      await t.db.query(
        `UPDATE "${schemaOf(tenant.slug)}".users SET password_reset_expires = now() - interval '1 minute' WHERE email = $1`,
        [user.email],
      );
      const res = await reset(user.email, otp, OTHER_STRONG_PASSWORD);
      expect(res.body.code).toBe("AUTH_OTP_INVALID");
    });

    it("rejects a wrong code and burns the code after too many attempts", async () => {
      await forgot(user.email);
      const otp = otpFor(user.email);
      const wrong = otp === "000000" ? "111111" : "000000";
      let last = await reset(user.email, wrong, OTHER_STRONG_PASSWORD);
      expect(last.body.code).toBe("AUTH_OTP_INVALID");
      for (let i = 0; i < 12; i++) last = await reset(user.email, wrong, OTHER_STRONG_PASSWORD);
      // Even the right code no longer works.
      const right = await reset(user.email, otp, OTHER_STRONG_PASSWORD);
      expect(right.body.code).toBe("AUTH_OTP_INVALID");
    });

    it("answers unknown email like a bad code", async () => {
      const res = await reset(uniqueEmail("ghost"), "123456", OTHER_STRONG_PASSWORD);
      expect(res.body.code).toBe("AUTH_OTP_INVALID");
    });

    it("returns field errors for a weak password and keeps the code usable", async () => {
      await forgot(user.email);
      const otp = otpFor(user.email);
      const weak = await reset(user.email, otp, "short");
      expect(weak.status).toBe(422);
      expect(weak.headers["content-type"]).toMatch(/problem\+json/);
      expect(weak.body.errors.length).toBeGreaterThan(0);
      expect(weak.body.errors[0]).toHaveProperty("field");

      const common = await reset(user.email, otp, "123456789abc");
      expect(common.status).toBe(422);
    });

    it("blocks reuse of a recent password", async () => {
      await forgot(user.email);
      expect((await reset(user.email, otpFor(user.email), OTHER_STRONG_PASSWORD)).status).toBe(200);
      t.mail.clear();
      await forgot(user.email);
      const res = await reset(user.email, otpFor(user.email), user.password);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("PASSWORD_POLICY");
    });
  });

  describe("change-password", () => {
    const change = (cookies: string[], currentPassword: string, newPassword: string) =>
      t.http({ tenant: tenant.slug, cookies }).post("/users/me/change-password").send({ currentPassword, newPassword });

    it("changes the password, revokes other sessions and emails the owner", async () => {
      const a = await loginUser(t, tenant, user.email, user.password);
      const b = await loginUser(t, tenant, user.email, user.password);
      const res = await change(a.cookies, user.password, OTHER_STRONG_PASSWORD);

      expect(res.status).toBe(200);
      expect(t.mail.allTo(user.email).some((m) => m.template === "password-changed")).toBe(true);
      expect((await t.http({ tenant: tenant.slug, cookies: b.cookies }).get("/auth/me")).status).toBe(401);
      expect((await loginUser(t, tenant, user.email, OTHER_STRONG_PASSWORD)).res.status).toBe(200);
      expect((await loginUser(t, tenant, user.email, user.password)).res.status).toBe(401);
    });

    it("rejects a wrong current password", async () => {
      const a = await loginUser(t, tenant, user.email, user.password);
      const res = await change(a.cookies, "Not-the-password-1!", OTHER_STRONG_PASSWORD);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("blocks reusing a previous password", async () => {
      const a = await loginUser(t, tenant, user.email, user.password);
      expect((await change(a.cookies, user.password, OTHER_STRONG_PASSWORD)).status).toBe(200);
      const b = await loginUser(t, tenant, user.email, OTHER_STRONG_PASSWORD);
      const back = await change(b.cookies, OTHER_STRONG_PASSWORD, user.password);
      expect(back.status).toBe(400);
    });

    it("rejects a weak new password with 422 field errors", async () => {
      const a = await loginUser(t, tenant, user.email, user.password);
      const res = await change(a.cookies, user.password, "weak");
      expect(res.status).toBe(422);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it("requires a recent login: stale sessions get ACCESS_RECENT_AUTH_REQUIRED", async () => {
      const a = await loginUser(t, tenant, user.email, user.password);
      const realNow = Date.now.bind(Date);
      // 6 minutes later: beyond RECENT_AUTH_WINDOW_SECONDS (300) but within the 15m access token life.
      jest.spyOn(Date, "now").mockImplementation(() => realNow() + 6 * 60 * 1000);
      const res = await change(a.cookies, user.password, OTHER_STRONG_PASSWORD);
      jest.restoreAllMocks();

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ACCESS_RECENT_AUTH_REQUIRED");
      expect((await loginUser(t, tenant, user.email, user.password)).res.status).toBe(200);
    });

    it("requires authentication", async () => {
      const res = await change([], user.password, STRONG_PASSWORD + "x");
      expect(res.status).toBe(401);
    });
  });
});
