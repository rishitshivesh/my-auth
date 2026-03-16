// apps/auth-service/src/modules/session/session-management.service.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
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
      expect.objectContaining({ sessionId: expect.anything() }),
      expect.objectContaining({ revokedReason: "session_expired_cleanup" }),
    );
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
