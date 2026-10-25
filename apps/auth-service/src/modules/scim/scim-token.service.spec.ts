import * as crypto from "crypto";
import { ApiException, ProtocolException } from "@/common/http";
import { ScimTokenService } from "./scim-token.service";

function build() {
  const repo = {
    create: jest.fn((v: object) => ({ id: "tok-1", ...v })),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  return { service: new ScimTokenService(repo as never), repo };
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

describe("ScimTokenService", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  describe("createToken", () => {
    it("returns a raw scim_ token and stores only its sha256 hash", async () => {
      const { service, repo } = build();
      const { token, record } = await service.createToken("t1", "okta");
      expect(token).toMatch(/^scim_[0-9a-f]{64}$/);
      expect(record.tokenHash).toBe(sha(token));
      expect(JSON.stringify(repo.create.mock.calls)).not.toContain(token);
      expect(repo.save).toHaveBeenCalledWith(record);
      expect(record).toMatchObject({ tenantId: "t1", name: "okta", active: true, expiresAt: undefined });
    });

    it("generates unique tokens", async () => {
      const { service } = build();
      const a = await service.createToken("t1", "a");
      const b = await service.createToken("t1", "b");
      expect(a.token).not.toBe(b.token);
    });

    it("computes expiresAt from expiresInDays", async () => {
      const { service } = build();
      const { record } = await service.createToken("t1", "a", 30);
      expect(record.expiresAt).toEqual(new Date("2026-01-31T00:00:00Z"));
    });

    it("treats expiresInDays=0 as non-expiring", async () => {
      const { service } = build();
      const { record } = await service.createToken("t1", "a", 0);
      expect(record.expiresAt).toBeUndefined();
    });
  });

  it("listTokens scopes by tenant and active", async () => {
    const { service, repo } = build();
    repo.find.mockResolvedValue([]);
    await service.listTokens("t1");
    expect(repo.find).toHaveBeenCalledWith({ where: { tenantId: "t1", active: true }, order: { createdAt: "DESC" } });
  });

  describe("revokeToken", () => {
    it("soft-deletes an owned token", async () => {
      const { service, repo } = build();
      repo.findOne.mockResolvedValue({ id: "x" });
      await service.revokeToken("t1", "x");
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: "x", tenantId: "t1" } });
      expect(repo.softDelete).toHaveBeenCalledWith("x");
    });

    it("404s for another tenant's token", async () => {
      const { service, repo } = build();
      repo.findOne.mockResolvedValue(null);
      await expect(service.revokeToken("t2", "x")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
      await expect(service.revokeToken("t2", "x")).rejects.toBeInstanceOf(ApiException);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe("validateToken", () => {
    it("looks up by hash of the presented token and stamps lastUsedAt", async () => {
      const { service, repo } = build();
      const rec = { id: "r", tenantId: "t1", expiresAt: undefined };
      repo.findOne.mockResolvedValue(rec);
      await expect(service.validateToken("scim_abc")).resolves.toBe(rec);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { tokenHash: sha("scim_abc"), active: true } });
      expect(repo.update).toHaveBeenCalledWith("r", { lastUsedAt: new Date() });
    });

    it("never queries by the raw token", async () => {
      const { service, repo } = build();
      repo.findOne.mockResolvedValue({ id: "r" });
      await service.validateToken("scim_secret");
      expect(JSON.stringify(repo.findOne.mock.calls)).not.toContain("scim_secret");
    });

    it("rejects unknown token with 401 + WWW-Authenticate", async () => {
      const { service, repo } = build();
      repo.findOne.mockResolvedValue(null);
      const err = await service.validateToken("bogus").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProtocolException);
      const pe = err as ProtocolException;
      expect(pe.getStatus()).toBe(401);
      expect(pe.headers["WWW-Authenticate"]).toContain("Bearer");
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("rejects an expired token", async () => {
      const { service, repo } = build();
      repo.findOne.mockResolvedValue({ id: "r", expiresAt: new Date("2025-12-31T23:59:59Z") });
      const err = (await service.validateToken("t").catch((e: unknown) => e)) as ProtocolException;
      expect(err.getStatus()).toBe(401);
      expect(err.body).toMatchObject({ detail: "SCIM token has expired" });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("accepts a token expiring exactly now (boundary: strict <)", async () => {
      const { service, repo } = build();
      repo.findOne.mockResolvedValue({ id: "r", expiresAt: new Date("2026-01-01T00:00:00Z") });
      await expect(service.validateToken("t")).resolves.toBeDefined();
    });

    it("accepts a token expiring in the future", async () => {
      const { service, repo } = build();
      repo.findOne.mockResolvedValue({ id: "r", expiresAt: new Date("2026-01-01T00:00:01Z") });
      await expect(service.validateToken("t")).resolves.toBeDefined();
    });
  });
});
