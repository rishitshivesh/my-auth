import { canManage, isOwnerLevel, maxPriority } from "./role-hierarchy";

describe("role hierarchy", () => {
  it("lets an admin manage lower roles only", () => {
    expect(canManage(900, 500)).toBe(true);
    expect(canManage(900, 900)).toBe(false);
    expect(canManage(900, 1000)).toBe(false);
  });

  it("lets the top tier manage its own tier", () => {
    expect(canManage(1000, 1000)).toBe(true);
  });

  it("denies users with no roles", () => {
    expect(canManage(0, 0)).toBe(false);
  });

  it("computes max priority and owner level", () => {
    expect(maxPriority([])).toBe(0);
    expect(maxPriority([100, 900, 500])).toBe(900);
    expect(isOwnerLevel(900)).toBe(true);
    expect(isOwnerLevel(500)).toBe(false);
  });
});
