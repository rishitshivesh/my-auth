// apps/auth-service/src/modules/session/session-management.service.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { In } from "typeorm";
import { Session, OAuthRefreshToken, Tenant } from "@repo/database";
import { SessionManagementService } from "./session-management.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { SessionRepository } from "@/core/database/session.repository";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    tenantId: "tenant-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() - 1000),
    revokedAt: undefined,
    deletedAt: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Session;
}

describe("SessionManagementService.cleanupExpiredSessions()", () => {
  let service: SessionManagementService;

  const mockManager = {
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 2 }),
  };

  const mockSessionRepo = {
    find: jest.fn(),
    // SessionRepository exposes .transaction() directly (wraps this.manager.transaction)
    transaction: jest
      .fn()
      .mockImplementation(async (cb: (em: typeof mockManager) => Promise<void>) =>
        cb(mockManager),
      ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionManagementService,
        {
          provide: SessionRepository,
          useValue: mockSessionRepo,
        },
        {
          provide: getRepositoryToken(OAuthRefreshToken),
          useValue: { find: jest.fn() },
        },
        {
          provide: OAuthRefreshTokenService,
          useValue: { revokeSessionTokens: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(SessionManagementService);
  });

  it("soft-deletes only expired non-revoked sessions and revokes their tokens", async () => {
    const expiredPending = makeSession({ id: "sess-expired-pending" });
    mockSessionRepo.find.mockResolvedValue([expiredPending]);

    const result = await service.cleanupExpiredSessions();

    expect(result.sessionsCleanedUp).toBe(1);
    expect(mockManager.softDelete).toHaveBeenCalledWith(Session, ["sess-expired-pending"]);
    expect(mockManager.update).toHaveBeenCalledWith(
      OAuthRefreshToken,
      expect.objectContaining({ sessionId: In(["sess-expired-pending"]) }),
      expect.objectContaining({ revokedReason: "session_expired_cleanup" }),
    );
    expect(result.tokensRevoked).toBe(2);
  });

  it("returns zeros and skips the transaction when no sessions are expired", async () => {
    mockSessionRepo.find.mockResolvedValue([]);

    const result = await service.cleanupExpiredSessions();

    expect(result.sessionsCleanedUp).toBe(0);
    expect(result.tokensRevoked).toBe(0);
    expect(mockManager.softDelete).not.toHaveBeenCalled();
    expect(mockSessionRepo.transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test suite 2 — revokeSession logout hardening
// ---------------------------------------------------------------------------

import { SessionService } from "@/common/service/session.service";
import { RedisService } from "@/common/service/redis.service";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { CACHE_MANAGER } from "@nestjs/cache-manager";

describe("SessionService.revokeSession() logout hardening", () => {
  let sessionService: SessionService;

  const mockQuery = jest.fn();
  const mockFindOne = jest.fn();

  const mockDataSource = {
    manager: {
      query: mockQuery,
      findOne: mockFindOne,
    },
  };

  const mockRedis = {
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue(604800),
  };

  const mockCache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // getSchemaName: looks up tenant by id via manager.findOne
    mockFindOne.mockResolvedValue({ slug: "tenant-slug-1" });
    // revokeSession UPDATE query returns undefined
    mockQuery.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    sessionService = module.get(SessionService);
  });

  it("sets revokedAt, nulls refreshTokenHash, and deletes the Redis key", async () => {
    await sessionService.revokeSession("tenant-1", "sess-1", "user_logout");

    // Redis delete must be called
    expect(mockRedis.delete).toHaveBeenCalledWith("tenant-1", "session", "sess-1");

    // Raw SQL UPDATE must include revoked_at and the right params
    const updateCall = mockQuery.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("revoked_at"),
    );
    expect(updateCall).toBeDefined();
    const params = updateCall![1] as unknown[];
    expect(params).toContain("user_logout");
    expect(params).toContain("sess-1");
    expect(params).toContain("tenant-1");
  });
});

// ---------------------------------------------------------------------------
// Test suite 3 — refresh token double-use rejection
// ---------------------------------------------------------------------------

import { UnauthorizedException } from "@nestjs/common";

describe("OAuthRefreshTokenService — double-use of refresh token is rejected", () => {
  let refreshSvc: OAuthRefreshTokenService;

  // Simulate a token row that has already been used (used_at is set)
  const usedTokenRow = {
    id: "token-1",
    token_hash: "doesnotmatter",
    family_id: "family-1",
    tenant_id: "tenant-1",
    user_id: "user-1",
    session_id: "sess-1",
    client_id: null,
    scope: null,
    parent_token_id: null,
    used_at: new Date(Date.now() - 5000).toISOString(), // non-null → reuse detected
    revoked_at: null,
    revoked_reason: null,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    userEmail: "user@example.com",
  };

  const sessionRow = { id: "sess-1", revoked_at: null };

  const mockManagerQuery = jest.fn();
  const mockManagerFindOne = jest.fn();

  const mockTokenRepo = {
    manager: {
      query: mockManagerQuery,
      findOne: mockManagerFindOne,
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks(); // wipes the once-queue and default so each test starts clean
    // getSchemaName: findOne(Tenant) returns a tenant with a slug
    mockManagerFindOne.mockResolvedValue({ slug: "tenant-slug-1" } as Tenant);
    // query call 1: token lookup → return the already-used token
    // query call 2: session lookup → return session
    // query call 3+: revokeTokenFamily UPDATE
    mockManagerQuery
      .mockResolvedValueOnce([usedTokenRow])  // token SELECT
      .mockResolvedValueOnce([sessionRow])    // session SELECT
      .mockResolvedValue([[], 2]);            // UPDATE returns [rows, rowCount] — prevents result[1] TypeError

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthRefreshTokenService,
        { provide: getRepositoryToken(OAuthRefreshToken), useValue: mockTokenRepo },
      ],
    }).compile();

    refreshSvc = module.get(OAuthRefreshTokenService);
  });

  it("throws UnauthorizedException when the same token is used twice", async () => {
    await expect(
      refreshSvc.rotateRefreshToken({
        tenantId: "tenant-1",
        token: "any-raw-token",
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("revokes the entire token family when reuse is detected", async () => {
    await expect(
      refreshSvc.rotateRefreshToken({
        tenantId: "tenant-1",
        token: "any-raw-token",
      }),
    ).rejects.toThrow();

    // The family-revoke UPDATE must have been issued
    // "family_revoked_reuse_detection" is in the params array (call[1]), not the SQL (call[0])
    const familyRevokeCall = mockManagerQuery.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        (call[1] as unknown[]).includes("family_revoked_reuse_detection"),
    );
    expect(familyRevokeCall).toBeDefined();
    expect(familyRevokeCall![1]).toContain("family-1");
    expect(familyRevokeCall![1]).toContain("tenant-1");
  });
});
