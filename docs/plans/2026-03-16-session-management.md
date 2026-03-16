# Session Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden session management with `applicationId` FK, an expired-session cleanup job, revocation that nulls the refresh token hash, and three regression tests.

**Architecture:** Minimal-delta approach — no field renames, no new libraries. `applicationId` is a nullable FK on the `sessions` table. Cleanup runs in `SessionManagementService` and is triggered every 15 minutes via the existing `@nestjs/schedule` cron in `TokenCleanupService`. `SessionService.revokeSession()` is hardened to null out `refreshTokenHash` on revocation.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL, `@nestjs/schedule` (already installed), Jest 30 + `@nestjs/testing`.

---

## Task 1: Fix Jest path alias resolution

The auth-service jest config has no `moduleNameMapper`, so `@/` imports crash in tests. Fix it before writing any spec.

**Files:**
- Modify: `apps/auth-service/package.json` (the `"jest"` key inside it)

**Step 1: Open the file and locate the `"jest"` block**

It currently ends with:
```json
"testEnvironment": "node"
```

**Step 2: Add `moduleNameMapper` to the jest block**

Replace the closing of the jest config so it reads:
```json
"jest": {
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/$1"
  },
  "collectCoverageFrom": ["**/*.(t|j)s"],
  "coverageDirectory": "../coverage",
  "testEnvironment": "node"
}
```

**Step 3: Verify no existing tests break**

Run from `apps/auth-service/`:
```bash
cd apps/auth-service && yarn test 2>&1 | tail -5
```
Expected: `No tests found` or `Test Suites: 0` — no errors about module resolution.

**Step 4: Commit**

```bash
git add apps/auth-service/package.json
git commit -m "test(auth-service): add moduleNameMapper for @/ path alias in jest config

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Migration — add `application_id` column + cleanup index

**Files:**
- Create: `packages/database/src/migrations/1773620000000-AddSessionApplicationId.ts`
- Modify: `packages/database/src/entities/session.entity.ts`

**Step 1: Create the migration file**

```typescript
// packages/database/src/migrations/1773620000000-AddSessionApplicationId.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSessionApplicationId1773620000000 implements MigrationInterface {
  name = "AddSessionApplicationId1773620000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add nullable application_id FK to oauth_clients
    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD COLUMN IF NOT EXISTS "application_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "sessions"
      ADD CONSTRAINT "FK_sessions_application_id"
      FOREIGN KEY ("application_id")
      REFERENCES "oauth_clients"("id")
      ON DELETE SET NULL
    `);

    // Partial index: only rows where revoked_at IS NULL are included.
    // This makes the 15-minute cleanup query fast even on large tables.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_expires_revoked"
      ON "sessions" ("expires_at")
      WHERE "revoked_at" IS NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sessions_expires_revoked"`);
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "FK_sessions_application_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP COLUMN IF EXISTS "application_id"`,
    );
  }
}
```

**Step 2: Add `applicationId` to the Session entity**

Open `packages/database/src/entities/session.entity.ts`. After the closing `}` of the `revokedReason` column (line 135) and before the closing `}` of the class (line 136), add:

```typescript
  @Column({
    type: "uuid",
    nullable: true,
    name: "application_id",
    comment: "OAuth client that initiated this session (nullable)",
  })
  applicationId?: string;
```

**Step 3: Verify TypeScript compiles**

```bash
cd packages/database && yarn tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add packages/database/src/migrations/1773620000000-AddSessionApplicationId.ts \
        packages/database/src/entities/session.entity.ts
git commit -m "feat(database): add application_id FK and cleanup index to sessions table

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: `cleanupExpiredSessions()` — write test first, then implement

**Files:**
- Create: `apps/auth-service/src/modules/session/session-management.service.spec.ts`
- Modify: `apps/auth-service/src/modules/session/session-management.service.ts`

### Step 1: Write the failing test

```typescript
// apps/auth-service/src/modules/session/session-management.service.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Session, OAuthRefreshToken } from "@repo/database";
import { SessionManagementService } from "./session-management.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";

// ---------------------------------------------------------------------------
// Shared mock factory helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    tenantId: "tenant-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    revokedAt: undefined,
    deletedAt: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Session;
}

// ---------------------------------------------------------------------------
// Test suite 1 — cleanupExpiredSessions
// ---------------------------------------------------------------------------

describe("SessionManagementService.cleanupExpiredSessions()", () => {
  let service: SessionManagementService;

  // Track calls into the mock transaction manager
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

  it("soft-deletes only expired non-revoked sessions, leaves others untouched", async () => {
    const expiredPending = makeSession({ id: "sess-expired-pending" });
    // These two must NOT appear in the find results (the query filters them out)
    // so the mock returns only the one that qualifies.
    mockSessionRepo.find.mockResolvedValue([expiredPending]);

    const result = await service.cleanupExpiredSessions();

    // Correct count returned
    expect(result.sessionsCleanedUp).toBe(1);

    // softDelete called inside the transaction with the right ID
    expect(mockManager.softDelete).toHaveBeenCalledWith(Session, ["sess-expired-pending"]);

    // Refresh tokens for that session revoked inside same transaction
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

// ---------------------------------------------------------------------------
// Test suite 2 — revokeSession logout hardening (tested via SessionService)
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

    // DB update must include revokedAt AND clear refreshTokenHash
    expect(mockSessionRepo.update).toHaveBeenCalledWith(
      { id: "sess-1", tenantId: "tenant-1" },
      expect.objectContaining({
        revokedAt: expect.any(Date),
        revokedReason: "user_logout",
        refreshTokenHash: null,
      }),
    );

    // Redis key must be removed
    expect(mockRedis.delete).toHaveBeenCalledWith("tenant-1", "session", "sess-1");
  });
});

// ---------------------------------------------------------------------------
// Test suite 3 — refresh token double-use rejection
// ---------------------------------------------------------------------------

import { UnauthorizedException } from "@nestjs/common";
import { OAuthRefreshTokenService as RefreshSvc } from "@/modules/oauth/services/oauth-refresh-token.service";

describe("OAuthRefreshTokenService — double-use of refresh token is rejected", () => {
  let refreshSvc: RefreshSvc;

  const usedToken = {
    id: "token-1",
    tokenHash: "abc123hash",
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
    // Ensure findOne returns the used token so reuse detection fires
    mockTokenRepo.findOne.mockResolvedValue(usedToken);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshSvc,
        { provide: getRepositoryToken(OAuthRefreshToken), useValue: mockTokenRepo },
      ],
    }).compile();

    refreshSvc = module.get(RefreshSvc);
  });

  it("throws UnauthorizedException when the same token is used twice", async () => {
    // The raw token value doesn't matter here because findOne is mocked;
    // what matters is that usedAt is already set on the returned record.
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

    // revokeTokenFamily internally calls repo.update with familyId
    expect(mockTokenRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: "family-1" }),
      expect.objectContaining({ revokedReason: "family_revoked_reuse_detection" }),
    );
  });
});
```

### Step 2: Run — expect failure on all suites

```bash
cd apps/auth-service && yarn test --testPathPattern="session-management.service.spec" --verbose 2>&1 | tail -30
```

Expected: `cleanupExpiredSessions` test **FAILS** with `service.cleanupExpiredSessions is not a function`, logout test **FAILS** with `refreshTokenHash` not in update args, double-use tests may already pass (existing `rotateRefreshToken` handles this — check).

### Step 3: Implement `cleanupExpiredSessions` in `SessionManagementService`

Open `apps/auth-service/src/modules/session/session-management.service.ts`.

At the top, update the typeorm import to add `LessThan` and `In`:
```typescript
import { Repository, IsNull, LessThan, In } from "typeorm";
```

Add the method at the end of the class (before the closing `}`):

```typescript
  /**
   * Soft-delete sessions that have expired but were never explicitly revoked.
   * Runs inside a single transaction so sessions and their tokens are cleaned
   * up atomically.
   */
  async cleanupExpiredSessions(): Promise<{
    sessionsCleanedUp: number;
    tokensRevoked: number;
  }> {
    const now = new Date();

    // Only fetch IDs — we don't need the full rows for the cleanup.
    const expired = await this.sessionRepository.find({
      where: {
        expiresAt: LessThan(now),
        revokedAt: IsNull(),
        deletedAt: IsNull(),
      },
      select: ["id"],
    });

    if (expired.length === 0) {
      return { sessionsCleanedUp: 0, tokensRevoked: 0 };
    }

    const ids = expired.map((s) => s.id);
    let tokensRevoked = 0;

    await this.sessionRepository.manager.transaction(async (manager) => {
      // 1. Soft-delete the session rows (sets deleted_at — keeps them for audit).
      await manager.softDelete(Session, ids);

      // 2. Revoke every refresh token that belongs to these sessions.
      const result = await manager.update(
        OAuthRefreshToken,
        { sessionId: In(ids), revokedAt: IsNull() },
        {
          revokedAt: now,
          revokedReason: "session_expired_cleanup",
        },
      );
      tokensRevoked = result.affected ?? 0;
    });

    this.logger.log("Expired session cleanup complete", {
      sessionsCleanedUp: ids.length,
      tokensRevoked,
    });

    return { sessionsCleanedUp: ids.length, tokensRevoked };
  }
```

### Step 4: Run — cleanup tests should now pass

```bash
cd apps/auth-service && yarn test --testPathPattern="session-management.service.spec" --verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|●)"
```

Expected: `cleanupExpiredSessions` suite **PASS**, other suites still **FAIL** (not yet implemented).

### Step 5: Commit

```bash
git add apps/auth-service/src/modules/session/session-management.service.ts \
        apps/auth-service/src/modules/session/session-management.service.spec.ts
git commit -m "feat(session): add cleanupExpiredSessions() with transaction and test

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Harden `SessionService.revokeSession()` to null `refreshTokenHash`

**Files:**
- Modify: `apps/auth-service/src/common/service/session.service.ts`

### Step 1: Locate `revokeSession` (lines 173–191)

The current update call is:
```typescript
await this.sessionRepository.update(
  { id: sessionId, tenantId },
  {
    revokedAt: new Date(),
    revokedReason: reason,
  },
);
```

### Step 2: Replace the update call to also null `refreshTokenHash`

Replace the block above with:
```typescript
await this.sessionRepository.update(
  { id: sessionId, tenantId },
  {
    revokedAt: new Date(),
    revokedReason: reason,
    // Null out the hash so a captured refresh token cannot be used
    // even if the oauth_refresh_tokens row revocation is delayed.
    refreshTokenHash: null as unknown as string,
  },
);
```

### Step 3: Run the tests — logout suite should now pass

```bash
cd apps/auth-service && yarn test --testPathPattern="session-management.service.spec" --verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|●)"
```

Expected: `cleanupExpiredSessions` **PASS**, `revokeSession logout hardening` **PASS**.

### Step 4: Commit

```bash
git add apps/auth-service/src/common/service/session.service.ts
git commit -m "fix(session): null refreshTokenHash on revocation to close post-logout replay window

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Verify double-use test passes (regression confirmation)

### Step 1: Run all three suites

```bash
cd apps/auth-service && yarn test --testPathPattern="session-management.service.spec" --verbose 2>&1 | tail -20
```

Expected: all **5 tests PASS** across the three describe blocks. The double-use tests should pass without any code change since `rotateRefreshToken` already handles reuse detection. If they fail, check:
- `mockTokenRepo.findOne` returns a record with `usedAt` already set.
- The service throws before reaching the rotation logic.

If tests fail for an unexpected reason (import error, missing mock field), fix the test setup only — do not change production code.

### Step 2: Commit only if test setup needed a fix

If the spec needed a minor mock adjustment, commit:
```bash
git add apps/auth-service/src/modules/session/session-management.service.spec.ts
git commit -m "test(session): fix mock setup for refresh token double-use spec

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Wire 15-minute cleanup cron into `TokenCleanupService`

**Files:**
- Modify: `apps/auth-service/src/modules/auth/token-cleanup.service.ts`
- Modify: `apps/auth-service/src/modules/auth/auth.module.ts`
- Modify: `apps/auth-service/src/modules/session/session.module.ts` (export already present — verify)

### Step 1: Verify `SessionModule` already exports `SessionManagementService`

Open `apps/auth-service/src/modules/session/session.module.ts`. Confirm `exports: [SessionManagementService]` is present (it is, per the existing code). No change needed.

### Step 2: Import `SessionModule` into `AuthModule`

Open `apps/auth-service/src/modules/auth/auth.module.ts`.

Add `SessionModule` to the imports:
```typescript
import { SessionModule } from "@/modules/session/session.module";
```

Inside `@Module({ imports: [...] })`, add `SessionModule` to the imports array (alongside `UserModule`, `EmailModule`, etc.):
```typescript
imports: [
  TypeOrmModule.forFeature([...]),
  UserModule,
  EmailModule,
  GuardsModule,
  SessionModule,         // ← add this
  ScheduleModule.forRoot(),
  PassportModule.register(JwtStrategy),
  JwtModule.registerAsync({ ... }),
],
```

### Step 3: Inject `SessionManagementService` into `TokenCleanupService`

Open `apps/auth-service/src/modules/auth/token-cleanup.service.ts`.

Add the import:
```typescript
import { SessionManagementService } from "@/modules/session/session-management.service";
```

Update the constructor to inject `SessionManagementService`:
```typescript
constructor(
  private readonly oauthRefreshTokenService: OAuthRefreshTokenService,
  private readonly sessionManagementService: SessionManagementService,
  @InjectRepository(Tenant)
  private readonly tenantRepository: Repository<Tenant>,
) {}
```

### Step 4: Add the 15-minute cron method

Add the following method to `TokenCleanupService`, right after the `hourlyCleanup()` method (after line 126):

```typescript
  /**
   * 15-minute session cleanup
   *
   * Soft-deletes expired sessions and revokes their refresh tokens.
   * Runs frequently so the sessions table does not accumulate unbounded
   * ghost rows from users who never explicitly logged out.
   */
  @Cron("*/15 * * * *", {
    name: "session-cleanup-15m",
    timeZone: "UTC",
  })
  async fifteenMinuteSessionCleanup() {
    this.logger.debug("🧹 Starting 15-minute session cleanup...");

    try {
      const { sessionsCleanedUp, tokensRevoked } =
        await this.sessionManagementService.cleanupExpiredSessions();

      if (sessionsCleanedUp > 0) {
        this.logger.log(
          `15m session cleanup: removed ${sessionsCleanedUp} sessions, revoked ${tokensRevoked} tokens`,
        );
      }
    } catch (error: any) {
      this.logger.error("❌ 15-minute session cleanup failed", {
        error: error.message,
      });
    }
  }
```

### Step 5: Verify TypeScript compiles

```bash
cd apps/auth-service && yarn tsc --noEmit 2>&1 | head -20
```

Expected: no errors. If you see a circular dependency warning or "not found" for `SessionModule`, double-check the import path in auth.module.ts (`@/modules/session/session.module`).

### Step 6: Run the full test suite one final time

```bash
cd apps/auth-service && yarn test --verbose 2>&1 | tail -15
```

Expected: all tests pass, no new failures.

### Step 7: Commit

```bash
git add apps/auth-service/src/modules/auth/token-cleanup.service.ts \
        apps/auth-service/src/modules/auth/auth.module.ts
git commit -m "feat(session): add 15-minute cron to clean up expired sessions

Wires SessionManagementService into TokenCleanupService and schedules
cleanupExpiredSessions() every 15 minutes via @nestjs/schedule.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Summary of all changed files

| File | Change |
|---|---|
| `apps/auth-service/package.json` | Add `moduleNameMapper` to jest config |
| `packages/database/src/migrations/1773620000000-AddSessionApplicationId.ts` | New migration: `application_id` column + partial index |
| `packages/database/src/entities/session.entity.ts` | Add `applicationId?: string` column |
| `apps/auth-service/src/modules/session/session-management.service.ts` | Add `cleanupExpiredSessions()` |
| `apps/auth-service/src/common/service/session.service.ts` | Null `refreshTokenHash` on revocation |
| `apps/auth-service/src/modules/auth/token-cleanup.service.ts` | Add 15-minute cron + inject `SessionManagementService` |
| `apps/auth-service/src/modules/auth/auth.module.ts` | Import `SessionModule` |
| `apps/auth-service/src/modules/session/session-management.service.spec.ts` | New: 3 test suites, 5 tests total |
