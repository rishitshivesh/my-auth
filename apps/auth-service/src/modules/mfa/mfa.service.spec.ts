import * as speakeasy from "speakeasy";
import { PasswordService } from "@repo/security";
import { MfaService } from "./mfa.service";
import { MfaGuardService } from "./mfa-guard.service";
import { createFakeRedis } from "./fake-redis";
import { DomainEventName } from "@/common/service/domain-events.service";
import type { MfaRequestContext } from "./mfa-context";

const TENANT = "tenant-1";
const USER = "user-1";
const ctx: MfaRequestContext = {
  requestId: "req-1",
  ipAddress: "203.0.113.9",
  userAgent: "jest",
};

function queryBuilderReturning(row: unknown) {
  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(row),
  };
  return qb;
}

describe("MfaService", () => {
  const secret = speakeasy.generateSecret({ length: 20 }).base32;
  const currentCode = () => speakeasy.totp({ secret, encoding: "base32" });

  let mfaRepo: { createQueryBuilder: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let events: { log: jest.Mock };
  let domainEvents: { publish: jest.Mock };
  let service: MfaService;

  function build(row: unknown) {
    mfaRepo = {
      createQueryBuilder: jest.fn(() => queryBuilderReturning(row)),
      findOne: jest.fn().mockResolvedValue(row),
      save: jest.fn().mockResolvedValue(row),
    };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: USER, email: "a@example.com", firstName: "Ada" }),
    };
    events = { log: jest.fn() };
    domainEvents = { publish: jest.fn() };
    service = new MfaService(
      mfaRepo as never,
      userRepo as never,
      {} as never,
      events as never,
      new MfaGuardService(createFakeRedis()),
      domainEvents as never,
    );
  }

  describe("TOTP login verification", () => {
    beforeEach(() => build({ totpSecret: secret, totpEnabled: true }));

    it("accepts a valid code once and rejects the same code a second time", async () => {
      const code = currentCode();
      expect(await service.verifyTotp(USER, TENANT, code)).toBe(true);
      expect(await service.verifyTotp(USER, TENANT, code)).toBe(false);
    });

    it("throws MFA_NOT_ENABLED when the user has no TOTP secret", async () => {
      build(null);
      await expect(service.verifyTotp(USER, TENANT, "123456")).rejects.toMatchObject({
        code: "MFA_NOT_ENABLED",
      });
    });

    it("voids the challenge after 5 wrong codes", async () => {
      for (let i = 0; i < 5; i++) {
        await expect(service.verifyTotp(USER, TENANT, "000000", "challenge-1")).rejects.toMatchObject({
          code: "AUTH_MFA_INVALID",
        });
      }
      await expect(
        service.verifyTotp(USER, TENANT, currentCode(), "challenge-1"),
      ).rejects.toMatchObject({ code: "AUTH_TOKEN_EXPIRED" });
    });
  });

  describe("enabling and disabling TOTP", () => {
    it("rejects a wrong code with AUTH_MFA_INVALID", async () => {
      build({ totpSecret: secret, totpEnabled: false });
      await expect(service.verifyAndEnableTotp(USER, TENANT, "000000", ctx)).rejects.toMatchObject({
        code: "AUTH_MFA_INVALID",
      });
    });

    it("reports MFA_NOT_STARTED and MFA_ALREADY_ENABLED", async () => {
      build({ totpEnabled: false });
      await expect(service.verifyAndEnableTotp(USER, TENANT, "1", ctx)).rejects.toMatchObject({
        code: "MFA_NOT_STARTED",
      });
      build({ totpSecret: secret, totpEnabled: true });
      await expect(service.verifyAndEnableTotp(USER, TENANT, "1", ctx)).rejects.toMatchObject({
        code: "MFA_ALREADY_ENABLED",
      });
    });

    it("writes a security event with the request id and emails on enable", async () => {
      build({ totpSecret: secret, totpEnabled: false });
      await service.verifyAndEnableTotp(USER, TENANT, currentCode(), ctx);

      expect(events.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "mfa.totp_enabled", requestId: "req-1", ipAddress: ctx.ipAddress }),
      );
      expect(domainEvents.publish).toHaveBeenCalledWith(
        DomainEventName.MFA_ENABLED,
        expect.objectContaining({ email: "a@example.com", requestId: "req-1", tenantId: TENANT }),
      );
    });

    it("writes a security event with the request id and emails on disable", async () => {
      build({ totpSecret: secret, totpEnabled: true });
      await service.disableTotp(USER, TENANT, ctx);

      expect(events.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "mfa.totp_disabled", requestId: "req-1" }),
      );
      expect(domainEvents.publish).toHaveBeenCalledWith(
        DomainEventName.MFA_DISABLED,
        expect.objectContaining({ email: "a@example.com" }),
      );
    });

    it("throws MFA_NOT_ENABLED when disabling without settings", async () => {
      build(null);
      await expect(service.disableTotp(USER, TENANT, ctx)).rejects.toMatchObject({
        code: "MFA_NOT_ENABLED",
      });
    });
  });

  describe("recovery codes", () => {
    it("accepts a stored (hashed) code once, then it is gone", async () => {
      const hash = await PasswordService.hash("ABCD-2345");
      const row = { backupCodes: [hash, "other"] };
      build(row);

      expect(await service.verifyBackupCode(USER, TENANT, "ABCD-2345")).toBe(true);
      expect(row.backupCodes).toEqual(["other"]);
      expect(await service.verifyBackupCode(USER, TENANT, "ABCD-2345")).toBe(false);
    });

    it("refuses a second concurrent use of the same stored code", async () => {
      const hash = await PasswordService.hash("WXYZ-2345");
      build({ backupCodes: [hash] });
      const guardSharedRow = { backupCodes: [hash] };
      mfaRepo.createQueryBuilder.mockImplementation(() => queryBuilderReturning(guardSharedRow));

      const [a, b] = await Promise.all([
        service.verifyBackupCode(USER, TENANT, "WXYZ-2345"),
        service.verifyBackupCode(USER, TENANT, "WXYZ-2345"),
      ]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
    });

    it("never stores a recovery code in plaintext", async () => {
      build({ totpSecret: secret, totpEnabled: false });
      const { backupCodes } = await service.verifyAndEnableTotp(USER, TENANT, currentCode(), ctx);
      const saved = mfaRepo.save.mock.calls[0][0].backupCodes as string[];
      expect(saved).toHaveLength(backupCodes.length);
      for (const code of backupCodes) expect(saved).not.toContain(code);
    });

    it("voids the challenge after 5 wrong recovery codes", async () => {
      const hash = await PasswordService.hash("GOOD-2345");
      build({ backupCodes: [hash] });
      for (let i = 0; i < 5; i++) {
        await expect(service.verifyBackupCode(USER, TENANT, "BAAD-2345", "c-9")).rejects.toMatchObject({
          code: "AUTH_MFA_INVALID",
        });
      }
      await expect(service.verifyBackupCode(USER, TENANT, "GOOD-2345", "c-9")).rejects.toMatchObject({
        code: "AUTH_TOKEN_EXPIRED",
      });
    });
  });
});
