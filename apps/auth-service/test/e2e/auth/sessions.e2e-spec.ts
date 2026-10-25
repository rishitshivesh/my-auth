import {
  cookieValue,
  cookiesOf,
  createTenant,
  createTestApp,
  loginUser,
  mergeCookies,
  registerAndVerifyUser,
  schemaOf,
  type TenantFixture,
  type TestApp,
  type UserFixture,
} from "../support";

describe("refresh rotation, logout and session management", () => {
  let t: TestApp;
  let tenant: TenantFixture;
  let user: UserFixture;

  beforeAll(async () => {
    t = await createTestApp();
    tenant = await createTenant(t);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.mail.clear();
    user = await registerAndVerifyUser(t, tenant);
  });

  const as = (cookies: string[]) => t.http({ tenant: tenant.slug, cookies });

  it("rotates the refresh token and issues a working access token", async () => {
    const first = await loginUser(t, tenant, user.email, user.password);
    const res = await as(first.cookies).post("/auth/refresh");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tenantSlug: tenant.slug, expiresIn: 900 });
    const rotated = cookiesOf(res);
    const newRefresh = cookieValue(rotated, "refreshToken");
    expect(newRefresh).not.toBe("");
    expect(newRefresh).not.toBe(first.refreshToken);

    const me = await as(mergeCookies(first.cookies, rotated)).get("/auth/me");
    expect(me.status).toBe(200);
  });

  it("requires a refresh cookie", async () => {
    const res = await as([]).post("/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("detects refresh token reuse, revokes the whole family and emails the user", async () => {
    const first = await loginUser(t, tenant, user.email, user.password);
    const rotated = await as(first.cookies).post("/auth/refresh");
    expect(rotated.status).toBe(200);
    const liveCookies = mergeCookies(first.cookies, cookiesOf(rotated));
    t.mail.clear();

    // Replay the OLD refresh token.
    const replay = await as(first.cookies).post("/auth/refresh");
    expect(replay.status).toBe(401);

    // The legitimate, newer refresh token is dead too.
    const afterReuse = await as(liveCookies).post("/auth/refresh");
    expect(afterReuse.status).toBe(401);

    await waitFor(() => t.mail.allTo(user.email).some((m) => m.template === "session-reuse-alert"));
    expect(t.mail.allTo(user.email).some((m) => m.template === "session-reuse-alert")).toBe(true);
  });

  it("logout revokes the session, clears cookies and invalidates the refresh token", async () => {
    const s = await loginUser(t, tenant, user.email, user.password);
    const out = await as(s.cookies).post("/auth/logout");
    expect(out.status).toBe(200);
    expect(out.body.data.message).toMatch(/logged out/i);
    expect(cookiesOf(out).join(";")).toMatch(/accessToken=;/);

    expect((await as(s.cookies).get("/auth/me")).status).toBe(401);
    expect((await as(s.cookies).post("/auth/refresh")).status).toBe(401);
  });

  it("protected routes answer 401 problem+json without credentials", async () => {
    const res = await as([]).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
  });

  it("lists active sessions and flags the current one", async () => {
    const a = await loginUser(t, tenant, user.email, user.password);
    await loginUser(t, tenant, user.email, user.password);
    const res = await as(a.cookies).get("/sessions/active");

    expect(res.status).toBe(200);
    const sessions = Array.isArray(res.body.data) ? res.body.data : res.body.data.sessions;
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.filter((s: { isCurrent?: boolean }) => s.isCurrent)).toHaveLength(1);
  });

  it("revokes a single other session without touching the current one", async () => {
    const a = await loginUser(t, tenant, user.email, user.password);
    const b = await loginUser(t, tenant, user.email, user.password);
    const [{ id }] = await t.db.query(
      `SELECT id FROM "${schemaOf(tenant.slug)}".sessions WHERE user_id = (SELECT id FROM "${schemaOf(tenant.slug)}".users WHERE email = $1) AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [user.email],
    );
    const del = await as(a.cookies).delete(`/sessions/${id}`);
    expect(del.status).toBe(204);

    expect((await as(b.cookies).get("/auth/me")).status).toBe(401);
    expect((await as(a.cookies).get("/auth/me")).status).toBe(200);
  });

  it("revokes all other sessions, then all sessions", async () => {
    const a = await loginUser(t, tenant, user.email, user.password);
    const b = await loginUser(t, tenant, user.email, user.password);

    const others = await as(a.cookies).delete("/sessions/all/other");
    expect(others.status).toBe(200);
    expect(others.body.data.revokedCount).toBeGreaterThanOrEqual(1);
    expect((await as(b.cookies).get("/auth/me")).status).toBe(401);
    expect((await as(a.cookies).get("/auth/me")).status).toBe(200);

    const all = await as(a.cookies).delete("/sessions/all");
    expect(all.status).toBe(200);
    expect((await as(a.cookies).get("/auth/me")).status).toBe(401);
  });

  it("cannot revoke another user's session (404)", async () => {
    const other = await registerAndVerifyUser(t, tenant);
    const o = await loginUser(t, tenant, other.email, other.password);
    const mine = await loginUser(t, tenant, user.email, user.password);
    const [{ id }] = await t.db.query(
      `SELECT s.id FROM "${schemaOf(tenant.slug)}".sessions s JOIN "${schemaOf(tenant.slug)}".users u ON u.id = s.user_id WHERE u.email = $1 AND s.revoked_at IS NULL LIMIT 1`,
      [other.email],
    );
    const res = await as(mine.cookies).delete(`/sessions/${id}`);
    expect([403, 404]).toContain(res.status);
    expect((await as(o.cookies).get("/auth/me")).status).toBe(200);
  });
});

async function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
}
