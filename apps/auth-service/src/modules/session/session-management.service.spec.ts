// apps/auth-service/src/modules/session/session-management.service.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { In } from "typeorm";
import { Session, OAuthRefreshToken } from "@repo/database";
import { SessionManagementService } from "./session-management.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";

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
    manager: {
      transaction: jest
        .fn()
        .mockImplementation(async (cb: (em: typeof mockManager) => Promise<void>) =>
          cb(mockManager),
        ),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionManagementService,
        {
          provide: getRepositoryToken(Session),
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
    expect(mockSessionRepo.manager.transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test suite 2 — revokeSession logout hardening
// ---------------------------------------------------------------------------

import { SessionService } from "@/common/service/session.service";
import { RedisService } from "@/common/service/redis.service";
import { ConfigService } from "@nestjs/config";

describe("SessionService.revokeSession() logout hardening", () => {
  let sessionService: SessionService;

  const mockSessionRepo = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockRedis = {
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue(604800),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: getRepositoryToken(Session), useValue: mockSessionRepo },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    sessionService = module.get(SessionService);
  });

  it("sets revokedAt, nulls refreshTokenHash, and deletes the Redis key", async () => {
    await sessionService.revokeSession("tenant-1", "sess-1", "user_logout");

    expect(mockSessionRepo.update).toHaveBeenCalledWith(
      { id: "sess-1", tenantId: "tenant-1" },
      expect.objectContaining({
        revokedAt: expect.any(Date),
        revokedReason: "user_logout",
        refreshTokenHash: null,
      }),
    );

    expect(mockRedis.delete).toHaveBeenCalledWith("tenant-1", "session", "sess-1");
  });
});

// ---------------------------------------------------------------------------
// Test suite 3 — refresh token double-use rejection
// ---------------------------------------------------------------------------

import { UnauthorizedException } from "@nestjs/common";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";

describe("OAuthRefreshTokenService — double-use of refresh token is rejected", () => {
  let refreshSvc: OAuthRefreshTokenService;

  const usedToken = {
    id: "token-1",
    tokenHash: "doesnotmatter",
    familyId: "family-1",
    tenantId: "tenant-1",
    userId: "user-1",
    sessionId: "sess-1",
    clientId: null,
    scope: null,
    usedAt: new Date(Date.now() - 5000), // already marked as used
    revokedAt: undefined,
    expiresAt: new Date(Date.now() + 86400000),
    session: { revokedAt: undefined },
    user: { email: "user@example.com" },
  };

  const mockTokenRepo = {
    findOne: jest.fn().mockResolvedValue(usedToken),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 2 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTokenRepo.findOne.mockResolvedValue(usedToken);

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

    expect(mockTokenRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: "family-1" }),
      expect.objectContaining({ revokedReason: "family_revoked_reuse_detection" }),
    );
  });
});
