import { describe, expect, it } from "@jest/globals";
import { tenantRoutes } from "@/constants/routes";
import { buildTiles, buildTrend, recentActivity, setupSteps } from "./overview";

const metrics = { totalUsers: 1234, activeSessions: 5, totalApplications: 0, mfaAdoptionRate: 0.456, activeApiKeys: 2 };

describe("dashboard overview model", () => {
  it("formats tiles and clamps the MFA rate", () => {
    const tiles = buildTiles({ ...metrics, mfaAdoptionRate: 3 });
    expect(tiles.find((t) => t.id === "users")?.value).toBe("1,234");
    expect(tiles.find((t) => t.id === "mfa")?.value).toBe("100%");
    expect(buildTiles(metrics).find((t) => t.id === "mfa")?.value).toBe("46%");
  });
  it("scales trend bars to the maximum and keeps zero days visible", () => {
    const bars = buildTrend([{ date: "a", count: 0 }, { date: "b", count: 10 }, { date: "c", count: 5 }]);
    expect(bars.map((b) => b.percent)).toEqual([2, 100, 50]);
    expect(buildTrend([{ date: "a", count: 0 }])[0]?.percent).toBe(2);
    expect(buildTrend([])).toEqual([]);
  });
  it("derives setup guidance from real counts", () => {
    const steps = setupSteps(metrics, tenantRoutes("acme"));
    expect(steps.map((s) => [s.id, s.done])).toEqual([["application", false], ["connection", true], ["mfa", false]]);
    expect(steps[0]?.href).toBe("/t/acme/applications");
  });
  it("returns newest activity first, limited", () => {
    const ev = (id: string, createdAt: string) => ({ id, createdAt, eventType: "x", ipAddress: "", severity: "info" as const });
    expect(recentActivity([ev("1", "2026-01-01"), ev("2", "2026-02-01")], 1).map((e) => e.id)).toEqual(["2"]);
  });
});
