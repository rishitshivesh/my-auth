import {
  cookieValue,
  createTenant,
  createTestApp,
  extractLink,
  registerAndVerifyUser,
  schemaOf,
  tokenFromLink,
  uniqueEmail,
  type TenantFixture,
  type TestApp,
  type UserFixture,
} from "../support";

describe("magic link sign-in", () => {
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

  const anon = () => t.http({ tenant: tenant.slug });
  const send = (email: string) => anon().post("/auth/magic-link/send").send({ email });
  const verify = (token: string) => anon().post("/auth/magic-link/verify").send({ token });
  const tokenFor = (email: string): string =>
    tokenFromLink(extractLink(t.mail.last(email, "magic-link")!, "/u/magic-link"));

  it("send is enumeration safe", async () => {
    const known = await send(user.email);
    const unknown = await send(uniqueEmail("ghost"));
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(t.mail.allTo(user.email)).toHaveLength(1);
  });

  it("verifies once: first use signs in, replay is rejected", async () => {
    await send(user.email);
    const token = tokenFor(user.email);

    const ok = await verify(token);
    expect(ok.status).toBe(200);
    const cookies = ok.headers["set-cookie"] as unknown as string[];
    expect(cookieValue(cookies, "accessToken")).not.toBe("");
    expect((await t.http({ tenant: tenant.slug, cookies }).get("/auth/me")).status).toBe(200);

    const replay = await verify(token);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("rejects an expired link", async () => {
    await send(user.email);
    const token = tokenFor(user.email);
    await t.db.query(
      `UPDATE "${schemaOf(tenant.slug)}".users SET magic_link_expires_at = now() - interval '1 minute' WHERE email = $1`,
      [user.email],
    );
    const res = await verify(token);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("rejects an unknown token", async () => {
    expect((await verify("f".repeat(64))).status).toBe(401);
  });

  it("a newer link supersedes the older one", async () => {
    await send(user.email);
    const first = tokenFor(user.email);
    await send(user.email);
    const second = tokenFor(user.email);
    expect((await verify(first)).status).toBe(401);
    expect((await verify(second)).status).toBe(200);
  });
});
