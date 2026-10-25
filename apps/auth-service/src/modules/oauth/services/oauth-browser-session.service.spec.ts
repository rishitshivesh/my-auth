import { OAuthBrowserSessionService } from "./oauth-browser-session.service";

const publicKey = { export: () => "PEM" };

function build(payload: Record<string, unknown> | Error, session: Record<string, unknown> | null = { userId: "u1", tenantId: "t1" }) {
  const jwt = {
    verify: jest.fn(() => {
      if (payload instanceof Error) throw payload;
      return payload;
    }),
  };
  const jwks = { getPublicKeyForToken: jest.fn().mockResolvedValue(publicKey) };
  const sessions = { validateSession: jest.fn().mockResolvedValue(session) };
  const service = new OAuthBrowserSessionService(jwt as never, jwks as never, sessions as never);
  return { service, jwt, sessions };
}
const req = (accessToken?: string) => ({ cookies: accessToken ? { accessToken } : {} }) as never;
const valid = { sub: "u1", tenantId: "t1", sessionId: "s1", authTime: 1000 };

describe("OAuthBrowserSessionService", () => {
  it("resolves the user, session id, auth time and default amr from the cookie", async () => {
    const { service, jwt, sessions } = build(valid);
    expect(await service.resolve(req("tok"), "t1")).toEqual({ userId: "u1", sessionId: "s1", authTime: 1000, amr: ["pwd"] });
    expect(jwt.verify).toHaveBeenCalledWith("tok", { publicKey: "PEM", algorithms: ["RS256"] });
    expect(sessions.validateSession).toHaveBeenCalledWith("t1", "s1");
  });

  it("reads an amr claim when the token carries one", async () => {
    const { service } = build({ ...valid, amr: ["pwd", "mfa"] });
    expect((await service.resolve(req("tok"), "t1"))!.amr).toEqual(["pwd", "mfa"]);
  });

  it("returns null without a cookie, with a bad signature, or with a purpose-bound token", async () => {
    expect(await build(valid).service.resolve(req(), "t1")).toBeNull();
    expect(await build(new Error("bad signature")).service.resolve(req("tok"), "t1")).toBeNull();
    for (const claim of [{ type: "mfa_pending" }, { mode: "link" }, { purpose: "x" }]) {
      expect(await build({ ...valid, ...claim }).service.resolve(req("tok"), "t1")).toBeNull();
    }
  });

  it("is tenant-bound: a token from another tenant is not a session here", async () => {
    expect(await build({ ...valid, tenantId: "t2" }).service.resolve(req("tok"), "t1")).toBeNull();
  });

  it("requires a live session that belongs to the token's user and tenant", async () => {
    expect(await build(valid, null).service.resolve(req("tok"), "t1")).toBeNull();
    expect(await build(valid, { userId: "other", tenantId: "t1" }).service.resolve(req("tok"), "t1")).toBeNull();
    expect(await build(valid, { userId: "u1", tenantId: "t2" }).service.resolve(req("tok"), "t1")).toBeNull();
  });
});
