import { ProtocolException } from "@/common/http";
import { ScimService } from "./scim.service";
import { SCIM_SCHEMA_GROUP, SCIM_SCHEMA_LIST, SCIM_SCHEMA_USER } from "./scim.types";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const U4 = "44444444-4444-4444-8444-444444444444";
const G1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const G9 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MISSING = "99999999-9999-4999-8999-999999999999";
const BASE = "https://sentry.test";
const now = new Date("2026-01-01T00:00:00Z");

const mkUser = (over: Record<string, unknown> = {}) => ({
  id: U1,
  tenantId: "t1",
  email: "a@x.test",
  firstName: "Ann",
  lastName: "Lee",
  displayName: "Ann L",
  isActive: true,
  createdAt: now,
  updatedAt: now,
  ...over,
});

function build() {
  const userRepo = {
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((v: object) => ({ id: "new", createdAt: now, updatedAt: now, ...v })),
    save: jest.fn((v: object) => Promise.resolve(v)),
    softDelete: jest.fn(),
    count: jest.fn(),
  };
  const groupRepo = {
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((v: object) => ({ id: G1, createdAt: now, ...v })),
    save: jest.fn((v: object) => Promise.resolve(v)),
    delete: jest.fn(),
  };
  const ugRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn((v: object) => v),
    save: jest.fn(),
    delete: jest.fn(),
  };
  return {
    service: new ScimService(userRepo as never, groupRepo as never, ugRepo as never),
    userRepo,
    groupRepo,
    ugRepo,
  };
}

async function scimErr(p: Promise<unknown>): Promise<ProtocolException> {
  const e = await p.catch((x: unknown) => x);
  expect(e).toBeInstanceOf(ProtocolException);
  return e as ProtocolException;
}

describe("ScimService users", () => {
  it("listUsers maps users, paginates (startIndex is 1-based) and scopes by tenant", async () => {
    const { service, userRepo } = build();
    userRepo.findAndCount.mockResolvedValue([[mkUser()], 41]);
    const res = await service.listUsers("t1", BASE, 11, 10);
    expect(userRepo.findAndCount).toHaveBeenCalledWith({
      where: { tenantId: "t1" },
      skip: 10,
      take: 10,
      order: { createdAt: "ASC" },
    });
    expect(res).toMatchObject({ schemas: [SCIM_SCHEMA_LIST], totalResults: 41, startIndex: 11, itemsPerPage: 10 });
    expect(res.Resources[0]).toMatchObject({
      schemas: [SCIM_SCHEMA_USER],
      id: U1,
      userName: "a@x.test",
      active: true,
      displayName: "Ann L",
      emails: [{ value: "a@x.test", primary: true, type: "work" }],
      meta: { resourceType: "User", location: `${BASE}/scim/v2/Users/${U1}`, created: now.toISOString() },
    });
  });

  it("listUsers applies a userName eq filter (case-insensitive operator) scoped to the tenant", async () => {
    const { service, userRepo } = build();
    userRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.listUsers("t1", BASE, 1, 100, 'USERNAME EQ "bob@x.test"');
    expect(userRepo.findAndCount.mock.calls[0]?.[0].where).toEqual({ tenantId: "t1", email: "bob@x.test" });
  });

  it.each(["active eq true", 'userName eq "x" and tenantId eq "t2"', 'userName co "x"'])(
    "rejects unsupported filter %s with 400 invalidFilter instead of returning every user",
    async (filter) => {
      const { service, userRepo } = build();
      const e = await scimErr(service.listUsers("t1", BASE, 1, 100, filter));
      expect(e.getStatus()).toBe(400);
      expect(e.body).toMatchObject({ scimType: "invalidFilter" });
      expect(userRepo.findAndCount).not.toHaveBeenCalled();
    },
  );

  it("listUsers uses defaults", async () => {
    const { service, userRepo } = build();
    userRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.listUsers("t1", BASE);
    expect(userRepo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
  });

  it("userToScim falls back: displayName->email, formatted from names", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue(mkUser({ displayName: null, firstName: "Ann", lastName: null }));
    const u = await service.getUser("t1", U1, BASE);
    expect(u.displayName).toBe("a@x.test");
    expect(u.name?.formatted).toBe("Ann");
    expect(u.name?.familyName).toBeUndefined();
  });

  it("getUser scopes by tenant and 404s with SCIM error body", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue(null);
    const e = await scimErr(service.getUser("t1", MISSING, BASE));
    expect(e.getStatus()).toBe(404);
    expect(e.body).toMatchObject({ status: "404", detail: "User not found" });
    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: MISSING, tenantId: "t1" } });
  });

  it("createUser creates verified, active-by-default user", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue(null);
    const res = await service.createUser(
      "t1",
      { schemas: [], userName: "n@x.test", name: { givenName: "N", familyName: "M" }, displayName: "NM" },
      BASE,
    );
    expect(userRepo.create).toHaveBeenCalledWith({
      tenantId: "t1",
      email: "n@x.test",
      firstName: "N",
      lastName: "M",
      displayName: "NM",
      isActive: true,
      emailVerified: true,
    });
    expect(res.userName).toBe("n@x.test");
  });

  it("createUser honours active=false", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue(null);
    const res = await service.createUser("t1", { schemas: [], userName: "n@x.test", active: false }, BASE);
    expect(res.active).toBe(false);
  });

  it("createUser 409 uniqueness on duplicate email within tenant", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue(mkUser());
    const e = await scimErr(service.createUser("t1", { schemas: [], userName: "a@x.test" }, BASE));
    expect(e.getStatus()).toBe(409);
    expect(e.body).toMatchObject({ scimType: "uniqueness" });
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: "t1", email: "a@x.test" } });
  });

  it("replaceUser overwrites provided fields and keeps others", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue(mkUser());
    const res = await service.replaceUser("t1", U1, { schemas: [], userName: "ignored@x", name: { givenName: "Zed" }, active: false }, BASE);
    expect(res.name?.givenName).toBe("Zed");
    expect(res.name?.familyName).toBe("Lee");
    expect(res.active).toBe(false);
    expect(res.userName).toBe("a@x.test"); // email cannot be changed via PUT
  });

  it("replaceUser keeps existing values when payload omits them", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue(mkUser());
    const res = await service.replaceUser("t1", U1, { schemas: [], userName: "a@x.test" }, BASE);
    expect(res).toMatchObject({ displayName: "Ann L", active: true });
  });

  it("replaceUser 404", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue(null);
    expect((await scimErr(service.replaceUser("t1", MISSING, { schemas: [], userName: "a" }, BASE))).getStatus()).toBe(404);
  });

  describe("patchUser", () => {
    it("replace active via path", async () => {
      const { service, userRepo } = build();
      userRepo.findOne.mockResolvedValue(mkUser());
      const res = await service.patchUser("t1", U1, [{ op: "replace", path: "active", value: false }], BASE);
      expect(res.active).toBe(false);
    });

    it("replace active via value object (Azure AD style)", async () => {
      const { service, userRepo } = build();
      userRepo.findOne.mockResolvedValue(mkUser({ isActive: false }));
      const res = await service.patchUser("t1", U1, [{ op: "replace", value: { active: true } }], BASE);
      expect(res.active).toBe(true);
    });

    it("replace displayName; null value yields empty string", async () => {
      const { service, userRepo } = build();
      userRepo.findOne.mockResolvedValue(mkUser());
      const res = await service.patchUser("t1", U1, [{ op: "replace", path: "displayName", value: "New" }], BASE);
      expect(res.displayName).toBe("New");
      const res2 = await service.patchUser("t1", U1, [{ op: "replace", path: "displayName", value: null }], BASE);
      expect(res2.displayName).toBe("");
    });

    it("ignores add/remove ops, null value and unknown paths", async () => {
      const { service, userRepo } = build();
      userRepo.findOne.mockResolvedValue(mkUser());
      const res = await service.patchUser(
        "t1",
        U1,
        [
          { op: "add", path: "active", value: false },
          { op: "remove", path: "displayName" },
          { op: "replace", path: "userName", value: "evil@x" },
          { op: "replace", value: null },
        ],
        BASE,
      );
      expect(res).toMatchObject({ active: true, userName: "a@x.test", displayName: "Ann L" });
    });

    it("404 when user missing", async () => {
      const { service, userRepo } = build();
      userRepo.findOne.mockResolvedValue(null);
      expect((await scimErr(service.patchUser("t1", MISSING, [], BASE))).getStatus()).toBe(404);
    });
  });

  it("deleteUser soft-deletes within tenant; 404 otherwise", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValueOnce(mkUser());
    await service.deleteUser("t1", U1);
    expect(userRepo.softDelete).toHaveBeenCalledWith(U1);
    userRepo.findOne.mockResolvedValueOnce(null);
    expect((await scimErr(service.deleteUser("t1", U1))).getStatus()).toBe(404);
  });
});

describe("ScimService groups", () => {
  const group = { id: G1, name: "Eng", tenantId: "t1", createdAt: now };

  it("listGroups returns groups with members", async () => {
    const { service, groupRepo, ugRepo } = build();
    groupRepo.findAndCount.mockResolvedValue([[group], 1]);
    ugRepo.find.mockResolvedValue([{ userId: U1 }, { userId: U2 }]);
    const res = await service.listGroups("t1", BASE, 3, 5);
    expect(groupRepo.findAndCount).toHaveBeenCalledWith({ where: { tenantId: "t1" }, skip: 2, take: 5 });
    expect(res.Resources[0]).toMatchObject({
      schemas: [SCIM_SCHEMA_GROUP],
      displayName: "Eng",
      members: [{ value: U1 }, { value: U2 }],
      meta: { resourceType: "Group", location: `${BASE}/scim/v2/Groups/${G1}` },
    });
  });

  it("listGroups uses defaults", async () => {
    const { service, groupRepo } = build();
    groupRepo.findAndCount.mockResolvedValue([[], 0]);
    await service.listGroups("t1", BASE);
    expect(groupRepo.findAndCount).toHaveBeenCalledWith({ where: { tenantId: "t1" }, skip: 0, take: 100 });
  });

  it("getGroup found / 404", async () => {
    const { service, groupRepo } = build();
    groupRepo.findOne.mockResolvedValueOnce(group);
    expect((await service.getGroup("t1", G1, BASE)).id).toBe(G1);
    groupRepo.findOne.mockResolvedValueOnce(null);
    expect((await scimErr(service.getGroup("t1", G1, BASE))).body).toMatchObject({ detail: "Group not found" });
  });

  it("createGroup persists members", async () => {
    const { service, ugRepo, userRepo } = build();
    userRepo.count.mockResolvedValue(2);
    await service.createGroup("t1", { schemas: [], displayName: "Eng", members: [{ value: U1 }, { value: U2 }] }, BASE);
    expect(ugRepo.save).toHaveBeenCalledTimes(2);
    expect(ugRepo.create).toHaveBeenCalledWith({ groupId: G1, userId: U1, tenantId: "t1" });
  });

  it("createGroup without members saves none", async () => {
    const { service, ugRepo } = build();
    await service.createGroup("t1", { schemas: [], displayName: "Eng", members: [] }, BASE);
    await service.createGroup("t1", { schemas: [], displayName: "Eng" }, BASE);
    expect(ugRepo.save).not.toHaveBeenCalled();
  });

  describe("patchGroup", () => {
    it("404 when group missing", async () => {
      const { service, groupRepo } = build();
      groupRepo.findOne.mockResolvedValue(null);
      expect((await scimErr(service.patchGroup("t1", G9, [], BASE))).getStatus()).toBe(404);
    });

    it("renames group; nullish value keeps the name", async () => {
      const { service, groupRepo } = build();
      groupRepo.findOne.mockImplementation(() => Promise.resolve({ ...group }));
      const r1 = await service.patchGroup("t1", G1, [{ op: "replace", path: "displayName", value: "Ops" }], BASE);
      expect(r1.displayName).toBe("Ops");
      const r2 = await service.patchGroup("t1", G1, [{ op: "replace", path: "displayName", value: undefined }], BASE);
      expect(r2.displayName).toBe("Eng");
    });

    it("add members skips existing and adds new", async () => {
      const { service, groupRepo, ugRepo, userRepo } = build();
      userRepo.count.mockResolvedValue(2);
      groupRepo.findOne.mockResolvedValue({ ...group });
      ugRepo.findOne.mockResolvedValueOnce({ id: "x" }).mockResolvedValueOnce(null);
      await service.patchGroup("t1", G1, [{ op: "add", path: "members", value: [{ value: U1 }, { value: U2 }] }], BASE);
      expect(ugRepo.save).toHaveBeenCalledTimes(1);
      expect(ugRepo.create).toHaveBeenCalledWith({ groupId: G1, userId: U2, tenantId: "t1" });
    });

    it("remove members deletes each pair", async () => {
      const { service, groupRepo, ugRepo } = build();
      groupRepo.findOne.mockResolvedValue({ ...group });
      await service.patchGroup("t1", G1, [{ op: "remove", path: "members", value: [{ value: U1 }, { value: U2 }] }], BASE);
      expect(ugRepo.delete).toHaveBeenCalledWith({ groupId: G1, userId: U1 });
      expect(ugRepo.delete).toHaveBeenCalledWith({ groupId: G1, userId: U2 });
    });

    it("replace members wipes and re-adds", async () => {
      const { service, groupRepo, ugRepo, userRepo } = build();
      userRepo.count.mockResolvedValue(1);
      groupRepo.findOne.mockResolvedValue({ ...group });
      await service.patchGroup("t1", G1, [{ op: "replace", path: "members", value: [{ value: U3 }] }], BASE);
      expect(ugRepo.delete).toHaveBeenCalledWith({ groupId: G1 });
      expect(ugRepo.save).toHaveBeenCalledTimes(1);
    });

    it("ignores member ops whose value is not an array", async () => {
      const { service, groupRepo, ugRepo } = build();
      groupRepo.findOne.mockResolvedValue({ ...group });
      await service.patchGroup(
        "t1",
        G1,
        [
          { op: "add", path: "members", value: U1 },
          { op: "remove", path: "members" },
          { op: "replace", path: "members", value: {} },
        ],
        BASE,
      );
      expect(ugRepo.save).not.toHaveBeenCalled();
      expect(ugRepo.delete).not.toHaveBeenCalled();
    });
  });

  it("deleteGroup removes memberships then hard-deletes the tenant group; 404 when missing", async () => {
    const { service, groupRepo, ugRepo } = build();
    groupRepo.findOne.mockResolvedValueOnce(group);
    await service.deleteGroup("t1", G1);
    expect(ugRepo.delete).toHaveBeenCalledWith({ groupId: G1 });
    expect(groupRepo.delete).toHaveBeenCalledWith({ id: G1, tenantId: "t1" });
    groupRepo.findOne.mockResolvedValueOnce(null);
    expect((await scimErr(service.deleteGroup("t1", G1))).getStatus()).toBe(404);
  });

  it("createGroup rejects member ids that are not users of the same tenant", async () => {
    const { service, userRepo, groupRepo } = build();
    userRepo.count.mockResolvedValue(0);
    const e = await scimErr(
      service.createGroup("t1", { schemas: [], displayName: "G", members: [{ value: "foreign-user" }] }, BASE),
    );
    expect(e.getStatus()).toBe(400);
    expect(e.body).toMatchObject({ scimType: "invalidValue" });
    expect(groupRepo.save).not.toHaveBeenCalled();
  });

  it("patchGroup add rejects members outside the tenant but remove skips the membership check", async () => {
    const { service, userRepo, groupRepo, ugRepo } = build();
    groupRepo.findOne.mockResolvedValue({ ...group });
    userRepo.count.mockResolvedValue(0);
    const e = await scimErr(service.patchGroup("t1", G1, [{ op: "add", path: "members", value: [{ value: U4 }] }], BASE));
    expect(e.getStatus()).toBe(400);
    await service.patchGroup("t1", G1, [{ op: "remove", path: "members", value: [{ value: U4 }] }], BASE);
    expect(ugRepo.delete).toHaveBeenCalledWith({ groupId: G1, userId: U4 });
  });
});
