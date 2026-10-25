import { RbacService } from "./rbac.service";

type Role = { id: string; name: string; priority: number };
const role = (name: string, priority: number): Role => ({ id: name, name, priority });
const ADMIN = role("admin", 900);
const DEV = role("developer", 500);
const USER = role("user", 100);

function build(opts: {
  rolesByUser: Record<string, Role[]>;
  allRoles?: Role[];
}) {
  const assignments = Object.entries(opts.rolesByUser).flatMap(([userId, rs]) =>
    rs.map((r) => ({ userId, roleId: r.id, tenantId: "t1", role: r, isExpired: false })),
  );
  const userRoleRepo = {
    find: jest.fn(async ({ where }: { where: { userId?: string } }) =>
      assignments.filter((a) => !where.userId || a.userId === where.userId),
    ),
    findOne: jest.fn(async ({ where }: { where: { userId: string; roleId: string } }) =>
      assignments.find((a) => a.userId === where.userId && a.roleId === where.roleId) ?? null,
    ),
    delete: jest.fn(),
    remove: jest.fn(),
    save: jest.fn(async (x: unknown) => x),
  };
  const userRepo = { findOne: jest.fn(async () => ({ id: "x", email: "x@x.io" })) };
  const all = opts.allRoles ?? [ADMIN, DEV, USER];
  const roleService = {
    getRole: jest.fn(async (id: string) => all.find((r) => r.id === id)),
    getRoleByName: jest.fn(async (n: string) => all.find((r) => r.name === n) ?? null),
    listRoles: jest.fn(async () => all),
  };
  const service = new RbacService(
    userRepo as never,
    userRoleRepo as never,
    roleService as never,
    {} as never,
  );
  return { service, userRoleRepo };
}

describe("RbacService hierarchy and last-owner guards", () => {
  it("blocks an admin from granting the admin role", async () => {
    const { service } = build({ rolesByUser: { actor: [ADMIN], target: [USER] } });
    await expect(
      service.assignRole({ userId: "target", roleId: "admin", tenantId: "t1", assignedBy: "actor" }),
    ).rejects.toMatchObject({ code: "HIERARCHY_VIOLATION" });
  });

  it("blocks an admin from modifying an equal-rank admin", async () => {
    const { service } = build({ rolesByUser: { actor: [ADMIN], peer: [ADMIN, USER] } });
    await expect(
      service.removeRoleByName("peer", "user", "t1", "actor"),
    ).rejects.toMatchObject({ code: "HIERARCHY_VIOLATION" });
  });

  it("allows an admin to grant a lower role to a lower user", async () => {
    const { service, userRoleRepo } = build({ rolesByUser: { actor: [ADMIN], target: [USER] } });
    await service.assignRole({ userId: "target", roleId: "developer", tenantId: "t1", assignedBy: "actor" });
    expect(userRoleRepo.save).toHaveBeenCalled();
  });

  it("refuses to remove the last admin role", async () => {
    const { service, userRoleRepo } = build({ rolesByUser: { solo: [ADMIN] } });
    await expect(service.removeRoleByName("solo", "admin", "t1")).rejects.toMatchObject({
      code: "LAST_OWNER",
    });
    expect(userRoleRepo.delete).not.toHaveBeenCalled();
  });

  it("allows removing an admin role when another admin exists", async () => {
    const { service, userRoleRepo } = build({ rolesByUser: { a: [ADMIN], b: [ADMIN] } });
    await service.removeRoleByName("a", "admin", "t1");
    expect(userRoleRepo.delete).toHaveBeenCalled();
  });

  it("refuses setUserRoles that demotes the last admin", async () => {
    const { service, userRoleRepo } = build({ rolesByUser: { solo: [ADMIN] } });
    await expect(service.setUserRoles("solo", ["user"], "t1")).rejects.toMatchObject({
      code: "LAST_OWNER",
    });
    expect(userRoleRepo.delete).not.toHaveBeenCalled();
  });
});
