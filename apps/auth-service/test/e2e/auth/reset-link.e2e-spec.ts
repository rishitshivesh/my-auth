import { createHash } from "node:crypto";
import {
  createTenant, createTestApp, extractLink, loginUser, registerAndVerifyUser, tokenFromLink,
  OTHER_STRONG_PASSWORD, STRONG_PASSWORD, type TenantFixture, type TestApp, type UserFixture,
} from "../support";

describe("password reset by link", () => {
  let t: TestApp;
  let tenant: TenantFixture;
  let other: TenantFixture;
  let user: UserFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
    other = await createTenant(t);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    user = await registerAndVerifyUser(t, tenant);
    t.mail.clear();
  });

  const anon = (slug = tenant.slug) => t.http({ tenant: slug });
  const forgot = () => anon().post("/auth/forgot-password").send({ email: user.email });
  const linkToken = (): string => tokenFromLink(extractLink(t.mail.last(user.email, "password-reset")!, "/reset-password"));
  const validate = (token: string, slug = tenant.slug) => anon(slug).get("/auth/reset-password/validate").query({ token });
  const resetWith = (token: string, password: string) => anon().post("/auth/reset-password").send({ token, password });

  it("emails a link (and the fallback code); validation does not consume it", async () => {
    await forgot();
    const token = linkToken();
    expect(t.mail.last(user.email, "otp-code")).toBeDefined();
    for (let i = 0; i < 3; i++) {
      const res = await validate(token);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ valid: true });
      expect(JSON.stringify(res.body)).not.toContain(user.email);
    }
  });

  it("resets with the token, signs every session out, and is single use", async () => {
    const s = await loginUser(t, tenant, user.email, user.password);
    await forgot();
    const token = linkToken();
    expect((await resetWith(token, OTHER_STRONG_PASSWORD)).status).toBe(200);
    expect((await t.http({ tenant: tenant.slug, cookies: s.cookies }).get("/auth/me")).status).toBe(401);
    expect((await loginUser(t, tenant, user.email, OTHER_STRONG_PASSWORD)).res.status).toBe(200);
    expect(t.mail.allTo(user.email).some((m) => m.template === "password-changed")).toBe(true);
    const again = await resetWith(token, STRONG_PASSWORD);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("LINK_ALREADY_USED");
    const v = await validate(token);
    expect(v.body.code).toBe("LINK_ALREADY_USED");
  });

  it("a weak password is refused and the link stays usable", async () => {
    await forgot();
    const token = linkToken();
    expect((await resetWith(token, "short")).status).toBe(422);
    expect((await validate(token)).status).toBe(200);
    expect((await resetWith(token, OTHER_STRONG_PASSWORD)).status).toBe(200);
  });

  it("the code fallback still works and spends the link", async () => {
    await forgot();
    const token = linkToken();
    const code = String(t.mail.last(user.email, "otp-code")!.props["code"]);
    const res = await anon().post("/auth/reset-password").send({ email: user.email, otp: code, password: OTHER_STRONG_PASSWORD });
    expect(res.status).toBe(200);
    expect((await validate(token)).body.code).toBe("LINK_ALREADY_USED");
  });

  it("a new request supersedes the previous link", async () => {
    await forgot();
    const first = linkToken();
    t.mail.clear();
    await forgot();
    expect((await validate(first)).body.code).toBe("LINK_ALREADY_USED");
    expect((await validate(linkToken())).status).toBe(200);
  });

  it("an expired link reports LINK_EXPIRED", async () => {
    await forgot();
    const token = linkToken();
    const hash = createHash("sha256").update(token).digest("hex");
    const keys = await t.redis.keys(`*:link:password-reset:${hash}`);
    expect(keys).toHaveLength(1);
    const rec = JSON.parse((await t.redis.get(keys[0]!))!) as { expiresAt: number };
    await t.redis.set(keys[0]!, JSON.stringify({ ...rec, expiresAt: Date.now() - 1000 }), "EX", 600);
    const v = await validate(token);
    expect(v.status).toBe(410);
    expect(v.body.code).toBe("LINK_EXPIRED");
    expect((await resetWith(token, OTHER_STRONG_PASSWORD)).body.code).toBe("LINK_EXPIRED");
  });

  it("unknown tokens and tokens from another tenant look identical (no enumeration, tenant bound)", async () => {
    await forgot();
    const token = linkToken();
    const unknown = await validate("f".repeat(64));
    const wrongTenant = await validate(token, other.slug);
    for (const res of [unknown, wrongTenant]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("AUTH_TOKEN_INVALID");
    }
    expect((await anon(other.slug).post("/auth/reset-password").send({ token, password: OTHER_STRONG_PASSWORD })).status).toBe(401);
    expect((await validate(token)).status).toBe(200);
  });

  it("requires token OR email+otp", async () => {
    expect((await anon().post("/auth/reset-password").send({ password: OTHER_STRONG_PASSWORD })).status).toBe(422);
    expect((await anon().post("/auth/reset-password").send({ token: "short", password: OTHER_STRONG_PASSWORD })).status).toBe(422);
  });

  it("only one of two concurrent uses succeeds", async () => {
    await forgot();
    const token = linkToken();
    const [a, b] = await Promise.all([resetWith(token, OTHER_STRONG_PASSWORD), resetWith(token, OTHER_STRONG_PASSWORD)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});
