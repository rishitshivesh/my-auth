// apps/auth-service/src/modules/session/session-management.service.spec.ts
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Test, TestingModule } from "@nestjs/testing";
import { getDataSourceToken, getRepositoryToken } from "@nestjs/typeorm";
import { In } from "typeorm";
import { OAuthRefreshToken, Session } from "@repo/database";
import { SessionManagementService } from "./session-management.service";
import { SessionRepository } from "@/core/database/session.repository";
import { SessionService } from "@/common/service/session.service";
import { RedisService } from "@/common/service/redis.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";

// ---------------------------------------------------------------------------
// Suite 1 — expired-session cleanup
// ---------------------------------------------------------------------------

describe("SessionManagementService.cleanupExpiredSessions()", () => {
  let service: SessionManagementService;

  const mockManager = {
    softDelete: jest.fn(),
    update: jest.fn(),
  };

  const mockSessionRepository = {
    find: jest.fn(),
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockManager.softDelete.mockResolvedValue({ affected: 1 });
    mockManager.update.mockResolvedValue({ affected: 2 });
    mockSessionRepository.transaction.mockImplementation(
      async (cb: (manager: typeof mockManager) => Promise<unknown>) => cb(mockManager),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionManagementService,
        { provide: SessionRepository, useValue: mockSessionRepository },
        { provide: getRepositoryToken(OAuthRefreshToken), useValue: { find: jest.fn() } },
        { provide: OAuthRefreshTokenService, useValue: { revokeSessionTokens: jest.fn() } },
      ],
    }).compile();

    service = module.get(SessionManagementService);
  });

  it("soft-deletes only expired, non-revoked sessions and revokes their refresh tokens", async () => {
    mockSessionRepository.find.mockResolvedValue([{ id: "sess-expired-pending" }]);

    const result = await service.cleanupExpiredSessions();

    expect(result).toEqual({ sessionsCleanedUp: 1, tokensRevoked: 2 });
    expect(mockSessionRepository.transaction).toHaveBeenCalledTimes(1);
    expect(mockManager.softDelete).toHaveBeenCalledWith(Session, ["sess-expired-pending"]);
    expect(mockManager.update).toHaveBeenCalledWith(
      OAuthRefreshToken,
      expect.objectContaining({ sessionId: In(["sess-expired-pending"]) }),
      expect.objectContaining({ revokedReason: "session_expired_cleanup" }),
    );
  });

  it("returns zeros and opens no transaction when nothing has expired", async () => {
    mockSessionRepository.find.mockResolvedValue([]);

    const result = await service.cleanupExpiredSessions();

    expect(result).toEqual({ sessionsCleanedUp: 0, tokensRevoked: 0 });
    expect(mockSessionRepository.transaction).not.toHaveBeenCalled();
    expect(mockManager.softDelete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — logout hardening: revokeSession must revoke in Postgres AND Redis
// ---------------------------------------------------------------------------

describe("SessionService.revokeSession() logout hardening", () => {
  let sessionService: SessionService;

  const mockQuery = jest.fn();
  const mockDataSource = {
    manager: { query: mockQuery, findOne: jest.fn() },
  };
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
  };
  const mockRedis = {
    delete: jest.fn(),
  };
  const mockConfig = {
    get: jest.fn().mockReturnValue(604800),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockRedis.delete.mockResolvedValue(undefined);
    // Tenant schema already cached → no tenant lookup query
    mockCache.get.mockResolvedValue("fk_acme");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    sessionService = module.get(SessionService);
  });

  it("sets revoked_at, nulls refresh_token_hash in the tenant schema, and deletes the Redis key", async () => {
    await sessionService.revokeSession("tenant-1", "sess-1", "user_logout");

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE "fk_acme"."sessions"');
    expect(sql).toContain("revoked_at = $1");
    expect(sql).toContain("refresh_token_hash = NULL");
    expect(sql).toContain("tenant_id = $4");
    expect(params).toEqual([expect.any(Date), "user_logout", "sess-1", "tenant-1"]);

    expect(mockRedis.delete).toHaveBeenCalledWith("tenant-1", "session", "sess-1");
  });

  it("still removes the Redis session when called for a different reason", async () => {
    await sessionService.revokeSession("tenant-1", "sess-2", "admin_revoked");

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe("admin_revoked");
    expect(mockRedis.delete).toHaveBeenCalledWith("tenant-1", "session", "sess-2");
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — refresh-token reuse detection
// ---------------------------------------------------------------------------

describe("OAuthRefreshTokenService — refresh-token reuse is rejected", () => {
  let refreshService: OAuthRefreshTokenService;

  const usedTokenRow = {
    id: "token-1",
    tenant_id: "tenant-1",
    user_id: "user-1",
    session_id: "sess-1",
    client_id: null,
    scope: null,
    token_hash: "irrelevant",
    family_id: "family-1",
    parent_token_id: null,
    used_at: new Date(Date.now() - 5_000).toISOString(), // already used once
    revoked_at: null,
    revoked_reason: null,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    userEmail: "user@example.com",
  };

  const mockQuery = jest.fn();
  const mockTokenRepository = {
    manager: {
      query: mockQuery,
      findOne: jest.fn().mockResolvedValue({ id: "tenant-1", slug: "acme" }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTokenRepository.manager.findOne.mockResolvedValue({ id: "tenant-1", slug: "acme" });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "fk_acme"."oauth_refresh_tokens"')) return [usedTokenRow];
      if (sql.includes('FROM "fk_acme"."sessions"')) return [{ id: "sess-1", revoked_at: null }];
      if (sql.startsWith("UPDATE") || sql.trimStart().startsWith("UPDATE")) return [[], 3];
      return [];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthRefreshTokenService,
        { provide: getRepositoryToken(OAuthRefreshToken), useValue: mockTokenRepository },
      ],
    }).compile();

    refreshService = module.get(OAuthRefreshTokenService);
  });

  it("throws UnauthorizedException when an already-used token is presented", async () => {
    await expect(
      refreshService.rotateRefreshToken({ tenantId: "tenant-1", token: "raw-token" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("revokes the entire token family when reuse is detected", async () => {
    await expect(
      refreshService.rotateRefreshToken({ tenantId: "tenant-1", token: "raw-token" }),
    ).rejects.toThrow(UnauthorizedException);

    const familyRevocation = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("WHERE family_id = $3"),
    ) as [string, unknown[]] | undefined;

    expect(familyRevocation).toBeDefined();
    expect(familyRevocation![0]).toContain('UPDATE "fk_acme"."oauth_refresh_tokens"');
    expect(familyRevocation![1]).toEqual([
      expect.any(Date),
      "family_revoked_reuse_detection",
      "family-1",
      "tenant-1",
    ]);
  });

  it("never issues a new token for a reused token", async () => {
    await expect(
      refreshService.rotateRefreshToken({ tenantId: "tenant-1", token: "raw-token" }),
    ).rejects.toThrow();

    const inserts = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO"),
    );
    expect(inserts).toHaveLength(0);
  });
});
