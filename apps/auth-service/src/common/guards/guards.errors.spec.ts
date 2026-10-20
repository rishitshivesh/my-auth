import { ExecutionContext } from "@nestjs/common";
import { SessionRepository } from "@/core/database/session.repository";
import { ApiException } from "../http";
import { JwtAuthGuard } from "./jwt-auth-guard";
import { SessionGuard } from "./session.guard";

const contextWith = (request: Record<string, unknown>): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

describe("JwtAuthGuard.handleRequest", () => {
  const guard = new JwtAuthGuard();
  const ctx = (tenantId?: string) => contextWith({ tenant: tenantId ? { id: tenantId } : undefined });

  it("maps a missing user to AUTH_TOKEN_INVALID", () => {
    expect(() => guard.handleRequest(null, false, undefined, ctx("t1"))).toThrow(
      expect.objectContaining({ code: "AUTH_TOKEN_INVALID" }),
    );
  });

  it("maps an expired token to AUTH_TOKEN_EXPIRED", () => {
    const expired = Object.assign(new Error("jwt expired"), { name: "TokenExpiredError" });
    expect(() => guard.handleRequest(null, false, expired, ctx("t1"))).toThrow(
      expect.objectContaining({ code: "AUTH_TOKEN_EXPIRED" }),
    );
  });

  it("maps a cross-tenant token to TENANT_MISMATCH", () => {
    const user = { tenantId: "t2" };
    expect(() => guard.handleRequest(null, user, undefined, ctx("t1"))).toThrow(
      expect.objectContaining({ code: "TENANT_MISMATCH" }),
    );
  });

  it("passes a same-tenant user through", () => {
    const user = { tenantId: "t1" };
    expect(guard.handleRequest(null, user, undefined, ctx("t1"))).toBe(user);
  });
});

describe("SessionGuard", () => {
  const sessions = (row: unknown) => ({ findOne: jest.fn(async () => row), update: jest.fn() }) as unknown as SessionRepository;
  const run = (row: unknown, user: Record<string, unknown> = { sessionId: "s1" }) =>
    new SessionGuard(sessions(row)).canActivate(contextWith({ user }));

  it("rejects a token without a session reference as AUTH_TOKEN_INVALID", async () => {
    await expect(run(null, {})).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
  });

  it("rejects an unknown session as AUTH_SESSION_REVOKED", async () => {
    await expect(run(null)).rejects.toBeInstanceOf(ApiException);
    await expect(run(null)).rejects.toMatchObject({ code: "AUTH_SESSION_REVOKED" });
  });

  it("rejects a revoked session as AUTH_SESSION_REVOKED", async () => {
    await expect(run({ revokedAt: new Date() })).rejects.toMatchObject({ code: "AUTH_SESSION_REVOKED" });
  });

  it("rejects an expired session as AUTH_TOKEN_EXPIRED", async () => {
    await expect(run({ expiresAt: new Date(Date.now() - 1000) })).rejects.toMatchObject({
      code: "AUTH_TOKEN_EXPIRED",
    });
  });

  it("accepts a live session", async () => {
    await expect(run({ expiresAt: new Date(Date.now() + 60_000) })).resolves.toBe(true);
  });
});
