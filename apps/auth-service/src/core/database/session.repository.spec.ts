import { DataSource } from "typeorm";
import { Session } from "@repo/database";
import { SessionRepository } from "./session.repository";
import { TenantContextService } from "./tenant-context.service";

function setup(withQr: boolean) {
  const dsManager = { query: jest.fn().mockResolvedValue([{ a: 1 }]), transaction: jest.fn() };
  const qrManager = { query: jest.fn().mockResolvedValue([{ b: 2 }]), transaction: jest.fn() };
  const ds = { manager: dsManager } as unknown as DataSource;
  const ctx = {
    getQueryRunner: jest.fn().mockReturnValue(withQr ? { manager: qrManager } : undefined),
  } as unknown as TenantContextService;
  return { repo: new SessionRepository(ds, ctx), dsManager, qrManager };
}

describe("SessionRepository", () => {
  it("targets the Session entity", () => {
    const { repo } = setup(false);
    expect((repo as unknown as { entityTarget: unknown }).entityTarget).toBe(Session);
  });

  it("uses the tenant-scoped query runner manager when present (search_path isolation)", async () => {
    const { repo, qrManager, dsManager } = setup(true);
    await expect(repo.executeRaw("SELECT 1", [1])).resolves.toEqual([{ b: 2 }]);
    expect(qrManager.query).toHaveBeenCalledWith("SELECT 1", [1]);
    expect(dsManager.query).not.toHaveBeenCalled();
  });

  it("falls back to the default manager outside a tenant context", async () => {
    const { repo, dsManager } = setup(false);
    await expect(repo.executeRaw("SELECT 1")).resolves.toEqual([{ a: 1 }]);
    expect(dsManager.query).toHaveBeenCalledWith("SELECT 1", undefined);
  });

  it("runs transactions on the scoped manager", async () => {
    const { repo, qrManager } = setup(true);
    qrManager.transaction.mockImplementation(async (fn: (m: unknown) => Promise<string>) => fn("M"));
    await expect(repo.transaction(async (m) => `got-${String(m)}`)).resolves.toBe("got-M");
  });
});
