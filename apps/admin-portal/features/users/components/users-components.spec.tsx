import { describe, expect, it } from "@jest/globals";
import { html } from "@/test-utils/render";
import { ActivityPanel } from "./ActivityPanel";
import { PersonAccessPanel } from "./PersonAccessPanel";
import { PersonStatusBadge } from "./PersonStatusBadge";
import { SessionsPanel } from "./SessionsPanel";

const noop = () => undefined;

describe("PersonStatusBadge", () => {
  it("renders status as text", () => {
    expect(html(<PersonStatusBadge status="suspended" />)).toContain("Suspended");
    expect(html(<PersonStatusBadge status="pending" />)).toContain("Pending");
  });
});

describe("SessionsPanel", () => {
  it("covers loading, error, empty and populated states", () => {
    const p = { canWrite: true, onRevoke: noop, onRevokeAll: noop, onRetry: noop };
    expect(html(<SessionsPanel {...p} sessions={[]} status="loading" />)).toContain('aria-busy="true"');
    expect(html(<SessionsPanel {...p} sessions={[]} status="error" />)).toContain('role="alert"');
    expect(html(<SessionsPanel {...p} sessions={[]} status="ready" />)).toContain("No active sessions");
    const out = html(<SessionsPanel {...p} status="ready" sessions={[{ id: "s", createdAt: "2026-01-01T00:00:00Z", deviceInfo: { browser: "Firefox", os: "macOS" } }]} />);
    expect(out).toContain("Firefox · macOS");
    expect(out).toContain("Revoke all sessions");
  });
  it("hides revoke controls without write permission", () => {
    const out = html(<SessionsPanel canWrite={false} onRevoke={noop} onRevokeAll={noop} onRetry={noop} status="ready" sessions={[{ id: "s", createdAt: "2026-01-01T00:00:00Z" }]} />);
    expect(out).not.toContain("Revoke");
  });
});

describe("ActivityPanel", () => {
  it("shows an empty state and events", () => {
    expect(html(<ActivityPanel events={[]} status="ready" onRetry={noop} />)).toContain("No recent activity");
    expect(html(<ActivityPanel events={[{ id: "1", eventType: "LOGIN_SUCCESS", severity: "high", createdAt: "2026-01-01T00:00:00Z" }]} status="ready" onRetry={noop} />)).toContain("Critical");
  });
});

describe("PersonAccessPanel", () => {
  const role = { id: "r", name: "viewer", isSystem: false, isActive: true, isDefault: false, priority: 1 };
  const base = { permissions: [], canWrite: true, onAssign: noop, onRevoke: noop, onRetry: noop };
  it("offers assign and revoke only with write access", () => {
    expect(html(<PersonAccessPanel {...base} roles={[role]} status="ready" />)).toContain("Assign roles");
    const ro = html(<PersonAccessPanel {...base} canWrite={false} roles={[role]} status="ready" />);
    expect(ro).not.toContain("Assign roles");
    expect(ro).toContain("viewer");
  });
  it("shows empty roles and effective permissions text", () => {
    const out = html(<PersonAccessPanel {...base} roles={[]} status="ready" />);
    expect(out).toContain("No roles assigned.");
    expect(out).toContain("No permissions from roles.");
  });
});
