import { TenantJobRunner } from "./tenant-job-runner.service";
import { TenantContextService, tenantStorage } from "./tenant-context.service";
import type { DataSource, QueryRunner } from "typeorm";

interface FakeRunner {
  connect: jest.Mock;
  query: jest.Mock;
  release: jest.Mock;
}

function makeRunner(lockGranted = true): FakeRunner {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(async (sql: string) =>
      sql.includes("pg_try_advisory_lock") ? [{ locked: lockGranted }] : [],
    ),
  };
}

function makeDataSource(
  runners: FakeRunner[],
  tenants: Array<{ id: string; slug: string; name: string }>,
): DataSource {
  let next = 0;
  return {
    createQueryRunner: jest.fn(() => runners[next++] as unknown as QueryRunner),
    manager: { find: jest.fn().mockResolvedValue(tenants) },
  } as unknown as DataSource;
}

describe("TenantJobRunner", () => {
  const tenants = [
    { id: "t1", slug: "acme", name: "Acme" },
    { id: "t2", slug: "Beta-Co", name: "Beta" },
  ];

  it("runs work once per active tenant with that tenant's schema active", async () => {
    const lock = makeRunner(true);
    const r1 = makeRunner();
    const r2 = makeRunner();
    const runner = new TenantJobRunner(
      makeDataSource([lock, r1, r2], tenants),
      new TenantContextService(),
    );

    const seen: Array<{ tenant: string; schema: string | undefined }> = [];
    const summary = await runner.forEachActiveTenant("job", async (tenant) => {
      seen.push({ tenant: tenant.id, schema: tenantStorage.getStore()?.schemaName });
    });

    expect(summary).toEqual({ ran: true, tenantsProcessed: 2, tenantsFailed: 0 });
    expect(seen).toEqual([
      { tenant: "t1", schema: "fk_acme" },
      { tenant: "t2", schema: "fk_beta_co" },
    ]);
    expect(r1.query).toHaveBeenCalledWith('SET search_path TO "fk_acme", public');
    expect(r2.query).toHaveBeenCalledWith('SET search_path TO "fk_beta_co", public');
    for (const r of [lock, r1, r2]) expect(r.release).toHaveBeenCalledTimes(1);
  });

  it("isolates failures: one tenant failing does not stop the others", async () => {
    const runner = new TenantJobRunner(
      makeDataSource([makeRunner(true), makeRunner(), makeRunner()], tenants),
      new TenantContextService(),
    );
    const done: string[] = [];

    const summary = await runner.forEachActiveTenant("job", async (tenant) => {
      if (tenant.id === "t1") throw new Error("boom");
      done.push(tenant.id);
    });

    expect(summary).toEqual({ ran: true, tenantsProcessed: 2, tenantsFailed: 1 });
    expect(done).toEqual(["t2"]);
  });

  it("skips the run when another replica holds the job lock", async () => {
    const lock = makeRunner(false);
    const ds = makeDataSource([lock], tenants);
    const runner = new TenantJobRunner(ds, new TenantContextService());
    const work = jest.fn();

    const summary = await runner.forEachActiveTenant("job", work);

    expect(summary).toEqual({ ran: false, tenantsProcessed: 0, tenantsFailed: 0 });
    expect(work).not.toHaveBeenCalled();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it("resets search_path and releases the runner even when work throws", async () => {
    const r = makeRunner();
    const runner = new TenantJobRunner(makeDataSource([r], []), new TenantContextService());

    await expect(
      runner.runInTenant("acme", async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");

    expect(r.query).toHaveBeenLastCalledWith("SET search_path TO public");
    expect(r.release).toHaveBeenCalledTimes(1);
  });
});
