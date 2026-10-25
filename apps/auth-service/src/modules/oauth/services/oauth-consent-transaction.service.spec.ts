import { OAuthConsentTransactionService } from "./oauth-consent-transaction.service";

function build() {
  const store = new Map<string, unknown>();
  const key = (t: string, r: string, i: string) => `${t}:${r}:${i}`;
  const redis = {
    set: jest.fn(async (t: string, r: string, i: string, v: unknown) => void store.set(key(t, r, i), JSON.parse(JSON.stringify(v)))),
    get: jest.fn(async (t: string, r: string, i: string) => store.get(key(t, r, i)) ?? null),
    consumeOnce: jest.fn(async (t: string, r: string, i: string) => store.delete(key(t, r, i))),
  };
  return { redis, service: new OAuthConsentTransactionService(redis as never) };
}

const data = {
  tenantId: "t1", userId: "u1", sessionId: "s1", authTime: 1, amr: ["pwd"], clientDbId: "c1",
  request: { client_id: "client_x", redirect_uri: "https://a/cb", scope: "openid" },
  grantedScopes: ["openid"],
};

describe("OAuthConsentTransactionService", () => {
  it("stores a transaction with a TTL and a per-transaction CSRF token", async () => {
    const { service, redis } = build();
    const a = await service.create(data);
    const b = await service.create(data);
    expect(a).not.toBe(b);
    expect(redis.set).toHaveBeenCalledWith("t1", "oauth_consent_tx", a, expect.objectContaining({ csrfToken: expect.any(String) }), 600);
    const txA = await service.peek("t1", a, "u1", "s1");
    const txB = await service.peek("t1", b, "u1", "s1");
    expect(txA!.csrfToken).not.toBe(txB!.csrfToken);
  });

  it.each([
    ["another user", "t1", "u2", "s1"],
    ["another session", "t1", "u1", "s2"],
    ["another tenant", "t2", "u1", "s1"],
  ])("does not reveal a transaction to %s", async (_n, tenant, user, session) => {
    const { service } = build();
    const id = await service.create(data);
    expect(await service.peek(tenant, id, user, session)).toBeNull();
  });

  it("consumes only with the right CSRF token, and only once", async () => {
    const { service } = build();
    const id = await service.create(data);
    const csrf = (await service.peek("t1", id, "u1", "s1"))!.csrfToken;
    expect(await service.consume("t1", id, "u1", "s1", "forged")).toBeNull();
    expect(await service.consume("t1", id, "u1", "s1", csrf.slice(0, -1))).toBeNull();
    expect(await service.consume("t1", id, "u1", "s1", csrf)).toMatchObject({ clientDbId: "c1" });
    expect(await service.consume("t1", id, "u1", "s1", csrf)).toBeNull();
  });
});
