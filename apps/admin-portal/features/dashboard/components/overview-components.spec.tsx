import { describe, expect, it } from "@jest/globals";
import { html } from "@/test-utils/render";
import { ActivityList, SetupGuide, StatTiles, TrendChart } from "./OverviewSections";

const noop = () => undefined;

describe("overview sections", () => {
  it("isolates a failing section with a retry", () => {
    expect(html(<StatTiles tiles={[]} status="error" onRetry={noop} />)).toContain("could not be loaded");
    expect(html(<TrendChart bars={[]} status="loading" onRetry={noop} />)).toContain('aria-busy="true"');
  });
  it("renders tiles, an empty trend and an empty activity feed", () => {
    expect(html(<StatTiles status="ready" onRetry={noop} tiles={[{ id: "users", value: "12" }]} />)).toContain("12");
    expect(html(<TrendChart bars={[]} status="ready" onRetry={noop} />)).toContain("No API activity");
    expect(html(<ActivityList events={[]} status="ready" onRetry={noop} auditHref="/t/a/audit" />)).toContain("No recent activity");
  });
  it("hides setup guidance once everything is done", () => {
    const done = [{ id: "application" as const, done: true, href: "/x" }];
    expect(html(<SetupGuide steps={done} />)).toBe("");
    expect(html(<SetupGuide steps={[{ id: "mfa", done: false, href: "/t/a/security" }]} />)).toContain("/t/a/security");
  });
});
