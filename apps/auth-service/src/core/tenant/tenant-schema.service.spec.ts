import { DataSource } from "typeorm";
import { TenantSchemaService } from "./tenant-schema.service";

jest.mock("@/common/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

function setup() {
  const lockQr = {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([]),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const ds = {
    query: jest.fn().mockResolvedValue([]),
    createQueryRunner: jest.fn().mockReturnValue(lockQr),
  };
  const svc = new TenantSchemaService(ds as unknown as DataSource);
  return { svc, ds, lockQr };
}

describe("TenantSchemaService", () => {
  it("getSchemaName sanitizes slugs to [a-z0-9_] (no identifier injection)", () => {
    const { svc } = setup();
    expect(svc.getSchemaName("Acme-Corp")).toBe("fk_acme_corp");
    expect(svc.getSchemaName('x"; DROP SCHEMA public;--')).toBe("fk_x___drop_schema_public___");
  });

  describe("isVerifiedAndReady", () => {
    it("queries with a bound parameter and caches positive results", async () => {
      const { svc, ds } = setup();
      ds.query.mockResolvedValueOnce([{ "?column?": 1 }]);
      await expect(svc.isVerifiedAndReady("acme")).resolves.toBe(true);
      expect(ds.query.mock.calls[0]![1]).toEqual(["fk_acme"]);
      await expect(svc.isVerifiedAndReady("acme")).resolves.toBe(true);
      expect(ds.query).toHaveBeenCalledTimes(1);
    });

    it("does not cache negatives", async () => {
      const { svc, ds } = setup();
      await expect(svc.isVerifiedAndReady("acme")).resolves.toBe(false);
      await svc.isVerifiedAndReady("acme");
      expect(ds.query).toHaveBeenCalledTimes(2);
    });
  });

  it("markVerified short-circuits schemaExists/tablesExist/isVerifiedAndReady", async () => {
    const { svc, ds } = setup();
    svc.markVerified("Acme");
    await expect(svc.isVerifiedAndReady("acme")).resolves.toBe(true);
    await expect(svc.schemaExists("acme")).resolves.toBe(true);
    await expect(svc.tablesExist("acme")).resolves.toBe(true);
    expect(ds.query).not.toHaveBeenCalled();
  });

  it("schemaExists and tablesExist query the database when unverified", async () => {
    const { svc, ds } = setup();
    ds.query.mockResolvedValueOnce([{ schema_name: "fk_a" }]).mockResolvedValueOnce([]);
    await expect(svc.schemaExists("a")).resolves.toBe(true);
    await expect(svc.tablesExist("a")).resolves.toBe(false);
    expect(ds.query.mock.calls[0]![1]).toEqual(["fk_a"]);
    expect(ds.query.mock.calls[1]![1]).toEqual(["fk_a"]);
  });

  describe("createSchema", () => {
    it("is a no-op when already verified", async () => {
      const { svc, ds } = setup();
      svc.markVerified("acme");
      await svc.createSchema("acme");
      expect(ds.createQueryRunner).not.toHaveBeenCalled();
    });

    it("locks, creates schema + all tables, recreates FKs, unlocks and releases", async () => {
      const { svc, ds, lockQr } = setup();
      ds.query.mockImplementation(async (sql: string) => {
        if (sql.includes("information_schema.table_constraints AS tc")) {
          return [
            { table_name: "sessions", column_name: "user_id", foreign_table_schema: "template", foreign_table_name: "users", foreign_column_name: "id", constraint_name: "fk_s_u", update_rule: "NO ACTION", delete_rule: "CASCADE" },
            { table_name: "x", column_name: "c", foreign_table_schema: "public", foreign_table_name: "tenants", foreign_column_name: "id", constraint_name: "fk_x_t", update_rule: "NO ACTION", delete_rule: "NO ACTION" },
            { table_name: "y", column_name: "c", foreign_table_schema: "template", foreign_table_name: "z", foreign_column_name: "id", constraint_name: "already_there", update_rule: "NO ACTION", delete_rule: "NO ACTION" },
          ];
        }
        if (sql.includes("SELECT constraint_name")) return [{ constraint_name: "already_there" }];
        return [];
      });
      await svc.createSchema("acme");

      const sqls = ds.query.mock.calls.map((c) => c[0] as string);
      expect(sqls[0]).toBe('CREATE SCHEMA IF NOT EXISTS "fk_acme"');
      expect(sqls.filter((s) => s.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(32);
      const fks = sqls.filter((s) => s.includes("ADD CONSTRAINT"));
      // The public.tenants FK is never recreated in a tenant schema (ADR 0005).
      expect(fks).toHaveLength(1);
      expect(fks[0]).toContain('REFERENCES "fk_acme"."users"');
      expect(fks.some((f) => f.includes('"public"."tenants"'))).toBe(false);
      expect(lockQr.query.mock.calls[0]![0]).toContain("pg_advisory_lock");
      expect(lockQr.query.mock.calls[0]![1]).toEqual(["schema_init:fk_acme"]);
      expect(lockQr.query.mock.calls[1]![0]).toContain("pg_advisory_unlock");
      expect(lockQr.release).toHaveBeenCalledTimes(1);
      await expect(svc.isVerifiedAndReady("acme")).resolves.toBe(true);
    });

    it("dropSchema drops the derived schema explicitly and forgets the verified cache", async () => {
      const { svc, ds } = setup();
      svc.markVerified("acme");
      await svc.dropSchema("Acme");
      expect(ds.query).toHaveBeenCalledWith('DROP SCHEMA IF EXISTS "fk_acme" CASCADE');
      ds.query.mockResolvedValue([]);
      await expect(svc.isVerifiedAndReady("acme")).resolves.toBe(false);
    });

    it("skips work if another pod verified the schema while waiting on the lock", async () => {
      const { svc, ds, lockQr } = setup();
      lockQr.query.mockImplementationOnce(async () => {
        svc.markVerified("acme");
        return [];
      });
      await svc.createSchema("acme");
      expect(ds.query).not.toHaveBeenCalled();
      expect(lockQr.query).toHaveBeenCalledTimes(2); // lock + unlock
      expect(lockQr.release).toHaveBeenCalled();
    });

    it("rethrows a table failure, still unlocks/releases, and does not mark verified", async () => {
      const { svc, ds, lockQr } = setup();
      ds.query.mockImplementation(async (sql: string) => {
        if (sql.includes('"sessions"') && sql.startsWith("CREATE TABLE")) throw new Error("disk full");
        return [];
      });
      await expect(svc.createSchema("acme")).rejects.toThrow("disk full");
      expect(lockQr.release).toHaveBeenCalled();
      expect(lockQr.query.mock.calls.at(-1)![0]).toContain("pg_advisory_unlock");
      expect(ds.query.mock.calls.length).toBeGreaterThan(0);
      await expect(svc.isVerifiedAndReady("acme")).resolves.toBe(false);
    });

    it("swallows unlock errors but still releases the connection", async () => {
      const { svc, lockQr } = setup();
      lockQr.query
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error("conn lost"));
      await expect(svc.createSchema("acme")).resolves.toBeUndefined();
      expect(lockQr.release).toHaveBeenCalled();
    });

    it("tolerates 'already exists' FK races but rethrows other FK errors", async () => {
      const row = { table_name: "t", column_name: "c", foreign_table_schema: "template", foreign_table_name: "u", foreign_column_name: "id", constraint_name: "fk1", update_rule: "NO ACTION", delete_rule: "NO ACTION" };
      const a = setup();
      a.ds.query.mockImplementation(async (sql: string) => {
        if (sql.includes("AS tc")) return [row];
        if (sql.includes("ADD CONSTRAINT")) throw new Error('constraint "fk1" already exists');
        return [];
      });
      await expect(a.svc.createSchema("acme")).resolves.toBeUndefined();

      const b = setup();
      b.ds.query.mockImplementation(async (sql: string) => {
        if (sql.includes("AS tc")) return [row];
        if (sql.includes("ADD CONSTRAINT")) throw "weird";
        return [];
      });
      await expect(b.svc.createSchema("acme")).rejects.toBe("weird");
    });
  });
});
