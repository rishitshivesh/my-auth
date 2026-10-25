import { TenantAllowedOriginsService } from "./tenant-allowed-origins.service";

function build(affected = 1, stored: string[] | null = ["https://a.example.com"]) {
  const repo = {
    findOne: jest.fn().mockResolvedValue({ allowedOrigins: stored ?? undefined }),
    update: jest.fn().mockResolvedValue({ affected }),
  };
  const tenantService = { invalidateCache: jest.fn().mockResolvedValue(undefined) };
  const cors = { refreshTenant: jest.fn().mockResolvedValue(undefined) };
  return { repo, tenantService, cors, svc: new TenantAllowedOriginsService(repo as never, tenantService as never, cors as never) };
}

describe("TenantAllowedOriginsService", () => {
  it("get returns the stored list (empty when unset)", async () => {
    expect(await build().svc.get("t1")).toEqual({ origins: ["https://a.example.com"] });
    expect(await build(1, null).svc.get("t1")).toEqual({ origins: [] });
  });

  it("replace canonicalises, de-duplicates, saves, then drops caches and refreshes CORS", async () => {
    const b = build();
    const out = await b.svc.replace("t1", ["https://App.Example.com", "https://app.example.com", "http://localhost:3000"]);
    expect(out.origins).toEqual(["https://app.example.com", "http://localhost:3000"]);
    expect(b.repo.update).toHaveBeenCalledWith({ id: "t1" }, { allowedOrigins: out.origins });
    expect(b.tenantService.invalidateCache).toHaveBeenCalledWith("t1");
    expect(b.cors.refreshTenant).toHaveBeenCalledWith("t1");
  });

  it.each(["*", "https://*.example.com", "http://example.com", "https://example.com/x", "null"])(
    "replace rejects %s and saves nothing",
    async (bad) => {
      const b = build();
      await expect(b.svc.replace("t1", ["https://ok.example.com", bad])).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      expect(b.repo.update).not.toHaveBeenCalled();
    },
  );

  it("replace can clear the list; unknown tenant yields TENANT_NOT_FOUND", async () => {
    expect(await build().svc.replace("t1", [])).toEqual({ origins: [] });
    await expect(build(0).svc.replace("missing", [])).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
  });
});
