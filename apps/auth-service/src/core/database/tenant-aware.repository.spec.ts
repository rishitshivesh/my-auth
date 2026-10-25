import type { DataSource } from "typeorm";
import { TenantAwareRepository } from "./tenant-aware.repository";
import type { TenantContextService } from "./tenant-context.service";

class Widget {
  id!: string;
}

class WidgetRepository extends TenantAwareRepository<Widget> {
  protected get entityTarget() {
    return Widget;
  }
}

const makeManager = () => ({
  findOne: jest.fn().mockResolvedValue({ id: "1" }),
  find: jest.fn().mockResolvedValue([{ id: "1" }]),
  save: jest.fn().mockImplementation(async (_t: unknown, e: unknown) => e),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  count: jest.fn().mockResolvedValue(3),
  createQueryBuilder: jest.fn().mockReturnValue("qb"),
});

function build(withTenantRunner: boolean) {
  const defaultManager = makeManager();
  const tenantManager = makeManager();
  const dataSource = { manager: defaultManager } as unknown as DataSource;
  const tenantContext = {
    getQueryRunner: jest.fn(() => (withTenantRunner ? { manager: tenantManager } : undefined)),
  } as unknown as TenantContextService;
  return { repo: new WidgetRepository(dataSource, tenantContext), defaultManager, tenantManager, tenantContext };
}

describe("TenantAwareRepository", () => {
  describe.each([
    ["inside a tenant request", true],
    ["outside a request (default manager)", false],
  ])("%s", (_name, inTenant) => {
    const pick = (b: ReturnType<typeof build>) => (inTenant ? b.tenantManager : b.defaultManager);
    const other = (b: ReturnType<typeof build>) => (inTenant ? b.defaultManager : b.tenantManager);

    it("routes every operation through the correct manager only", async () => {
      const b = build(inTenant);
      const where = { id: "1" };
      await expect(b.repo.findOne({ where })).resolves.toEqual({ id: "1" });
      await expect(b.repo.find({ where })).resolves.toEqual([{ id: "1" }]);
      await b.repo.save({ id: "2" }, { reload: false });
      await b.repo.update(where, { id: "3" });
      await b.repo.update("raw-id", { id: "3" });
      await b.repo.softDelete(where);
      await b.repo.delete(where);
      await expect(b.repo.count()).resolves.toBe(3);
      expect(b.repo.createQueryBuilder("w")).toBe("qb");

      const m = pick(b);
      expect(m.findOne).toHaveBeenCalledWith(Widget, { where });
      expect(m.find).toHaveBeenCalledWith(Widget, { where });
      expect(m.save).toHaveBeenCalledWith(Widget, { id: "2" }, { reload: false });
      expect(m.update).toHaveBeenNthCalledWith(1, Widget, where, { id: "3" });
      expect(m.update).toHaveBeenNthCalledWith(2, Widget, "raw-id", { id: "3" });
      expect(m.softDelete).toHaveBeenCalledWith(Widget, where);
      expect(m.delete).toHaveBeenCalledWith(Widget, where);
      expect(m.count).toHaveBeenCalledWith(Widget, undefined);
      expect(m.createQueryBuilder).toHaveBeenCalledWith(Widget, "w");

      for (const fn of Object.values(other(b))) expect(fn).not.toHaveBeenCalled();
    });

    it("resolves the query runner per call (never caches across requests)", async () => {
      const b = build(inTenant);
      await b.repo.find();
      await b.repo.find();
      expect(b.tenantContext.getQueryRunner).toHaveBeenCalledTimes(2);
    });
  });

  it("propagates manager errors instead of swallowing them", async () => {
    const b = build(true);
    b.tenantManager.save.mockRejectedValueOnce(new Error("constraint"));
    await expect(b.repo.save({ id: "x" })).rejects.toThrow("constraint");
  });
});
