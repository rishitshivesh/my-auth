import { SystemRoles } from "./system-roles";
import { ADMIN_ROLE_PRIORITY, canManage, isOwnerLevel, maxPriority } from "../role-hierarchy";

describe("SystemRoles", () => {
  it("seeds owner, admin, member and guest with strictly descending priority", () => {
    const { OWNER, ADMIN, MEMBER, GUEST } = SystemRoles;
    expect([OWNER, ADMIN, MEMBER, GUEST].map((r) => r.slug)).toEqual(["owner", "admin", "member", "guest"]);
    expect(OWNER.priority).toBeGreaterThan(ADMIN.priority);
    expect(ADMIN.priority).toBeGreaterThan(MEMBER.priority);
    expect(MEMBER.priority).toBeGreaterThan(GUEST.priority);
    expect(GUEST.priority).toBeGreaterThan(0);
  });

  it("all roles are system roles with unique slugs", () => {
    const roles = Object.values(SystemRoles);
    expect(roles.every((r) => r.isSystem)).toBe(true);
    expect(new Set(roles.map((r) => r.slug)).size).toBe(roles.length);
  });

  it("guest is never owner-level, so it cannot satisfy or trip the last-owner check", () => {
    expect(isOwnerLevel(SystemRoles.GUEST.priority)).toBe(false);
    expect(SystemRoles.GUEST.priority).toBeLessThan(ADMIN_ROLE_PRIORITY);
  });

  it("members outrank guests and guests cannot manage anyone (hierarchy)", () => {
    expect(canManage(SystemRoles.MEMBER.priority, SystemRoles.GUEST.priority)).toBe(true);
    expect(canManage(SystemRoles.GUEST.priority, SystemRoles.MEMBER.priority)).toBe(false);
    expect(canManage(SystemRoles.GUEST.priority, SystemRoles.GUEST.priority)).toBe(false);
    expect(maxPriority([SystemRoles.GUEST.priority, SystemRoles.MEMBER.priority])).toBe(SystemRoles.MEMBER.priority);
  });

  it("guest policy is a single read-only Allow limited to the caller's own resources", () => {
    const [stmt, ...rest] = SystemRoles.GUEST.policy.Statement;
    expect(rest).toHaveLength(0);
    expect(stmt?.Effect).toBe("Allow");
    expect(stmt?.Action).toEqual(["users:read", "sessions:read"]);
    for (const resource of stmt?.Resource ?? []) expect(resource).toContain("${sentry:UserId}");
    const memberActions = SystemRoles.MEMBER.policy.Statement.flatMap((s) => s.Action);
    for (const action of stmt?.Action ?? []) expect(memberActions).toContain(action);
  });
});
