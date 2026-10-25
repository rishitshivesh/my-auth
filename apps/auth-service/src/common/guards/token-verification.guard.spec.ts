import { ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { RequestUserGuard, TokenVerificationGuard } from "./token-verification.guard";

jest.mock("../logger", () => ({ logger: { error: jest.fn() } }));

type Req = {
  cookies: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  user?: unknown;
};

function ctx(req: Req): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

const USER = { sub: "u1", sessionId: "s1" };

function deps() {
  const jwt = { verify: jest.fn().mockReturnValue({ sub: "u1", sessionId: "s1" }) };
  const jwks = { getPublicKeyForToken: jest.fn().mockResolvedValue("PUB") };
  return { jwt, jwks, jwtS: jwt as unknown as JwtService, jwksS: jwks as unknown as JwksService };
}

describe("TokenVerificationGuard", () => {
  it("returns false without any token", async () => {
    const d = deps();
    const g = new TokenVerificationGuard(d.jwtS, d.jwksS);
    await expect(g.canActivate(ctx({ cookies: {}, headers: {} }))).resolves.toBe(false);
    expect(d.jwt.verify).not.toHaveBeenCalled();
  });

  it("verifies RS256 only and attaches user (cookie first)", async () => {
    const d = deps();
    const g = new TokenVerificationGuard(d.jwtS, d.jwksS);
    const req: Req = { cookies: { accessToken: "c" }, headers: { authorization: "h" } };
    await expect(g.canActivate(ctx(req))).resolves.toBe(true);
    expect(d.jwks.getPublicKeyForToken).toHaveBeenCalledWith("c");
    expect(d.jwt.verify).toHaveBeenCalledWith("c", { publicKey: "PUB", algorithms: ["RS256"] });
    expect(req.user).toEqual({ sub: "u1", sessionId: "s1" });
  });

  it("falls back to x-authorization then authorization", async () => {
    const d = deps();
    const g = new TokenVerificationGuard(d.jwtS, d.jwksS);
    await g.canActivate(ctx({ cookies: {}, headers: { "x-authorization": "x", authorization: "a" } }));
    expect(d.jwks.getPublicKeyForToken).toHaveBeenLastCalledWith("x");
    await g.canActivate(ctx({ cookies: {}, headers: { authorization: "a" } }));
    expect(d.jwks.getPublicKeyForToken).toHaveBeenLastCalledWith("a");
  });

  it("returns false when decoded payload is falsy", async () => {
    const d = deps();
    d.jwt.verify.mockReturnValue(null);
    const g = new TokenVerificationGuard(d.jwtS, d.jwksS);
    const req: Req = { cookies: { accessToken: "t" }, headers: {} };
    await expect(g.canActivate(ctx(req))).resolves.toBe(false);
    expect(req.user).toBeUndefined();
  });

  it.each([
    ["mfa_pending temp token", { sub: "u1", sessionId: "s", type: "mfa_pending" }],
    ["social completion token", { sub: "u1", sessionId: "s", mode: "x" }],
    ["purpose-bound token", { sub: "u1", sessionId: "s", purpose: "link" }],
    ["token without sessionId", { sub: "u1" }],
    ["token without sub", { sessionId: "s" }],
    ["non-string sub", { sub: 5, sessionId: "s" }],
  ])("rejects a %s even though the signature is valid", async (_n, payload) => {
    const d = deps();
    d.jwt.verify.mockReturnValue(payload);
    const g = new TokenVerificationGuard(d.jwtS, d.jwksS);
    const req: Req = { cookies: { accessToken: "t" }, headers: {} };
    await expect(g.canActivate(ctx(req))).resolves.toBe(false);
    expect(req.user).toBeUndefined();
  });

  it("returns false on tampered/expired token (verify throws)", async () => {
    const d = deps();
    d.jwt.verify.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    const g = new TokenVerificationGuard(d.jwtS, d.jwksS);
    const req: Req = { cookies: { accessToken: "t" }, headers: {} };
    await expect(g.canActivate(ctx(req))).resolves.toBe(false);
    expect(req.user).toBeUndefined();
  });

  it("returns false when key lookup fails", async () => {
    const d = deps();
    d.jwks.getPublicKeyForToken.mockRejectedValue(new Error("no kid"));
    const g = new TokenVerificationGuard(d.jwtS, d.jwksS);
    await expect(g.canActivate(ctx({ cookies: { accessToken: "t" }, headers: {} }))).resolves.toBe(false);
  });
});

describe("RequestUserGuard", () => {
  it("always allows and sets user when token valid", async () => {
    const d = deps();
    const g = new RequestUserGuard(d.jwtS, d.jwksS);
    const req: Req = { cookies: { accessToken: "t" }, headers: {} };
    await expect(g.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.user).toEqual({ sub: "u1", sessionId: "s1" });
  });

  it("allows anonymous requests without verifying", async () => {
    const d = deps();
    const g = new RequestUserGuard(d.jwtS, d.jwksS);
    await expect(g.canActivate(ctx({ cookies: {}, headers: {} }))).resolves.toBe(true);
    expect(d.jwt.verify).not.toHaveBeenCalled();
  });

  it("allows but leaves user unset when decoded is falsy", async () => {
    const d = deps();
    d.jwt.verify.mockReturnValue(undefined);
    const g = new RequestUserGuard(d.jwtS, d.jwksS);
    const req: Req = { cookies: {}, headers: { authorization: "a" } };
    await expect(g.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it("allows but never attaches a purpose-bound token as the user", async () => {
    const d = deps();
    d.jwt.verify.mockReturnValue({ sub: "u1", sessionId: "s", type: "mfa_pending" });
    const g = new RequestUserGuard(d.jwtS, d.jwksS);
    const req: Req = { cookies: { accessToken: "t" }, headers: {} };
    await expect(g.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it("never authenticates a bad token but does not block (logs error)", async () => {
    const d = deps();
    d.jwt.verify.mockImplementation(() => {
      throw new Error("expired");
    });
    const g = new RequestUserGuard(d.jwtS, d.jwksS);
    const req: Req = { cookies: { accessToken: "t" }, headers: {} };
    await expect(g.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });
});
