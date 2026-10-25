import { describe, expect, it } from "@jest/globals";
import { hasPermission } from "@/lib/permissions";
import { grantedPermissions } from "./permission-grants";

describe("grantedPermissions", () => {
  it("treats system owner and admin as full access (their authority comes from policies)", () => {
    expect(grantedPermissions([{ name: "owner", isSystem: true }], [])).toEqual(["*"]);
    expect(hasPermission(grantedPermissions([{ name: "Admin" }], []), "roles:write")).toBe(true);
  });

  it("keeps role-attached permissions for everyone else", () => {
    expect(grantedPermissions([{ name: "member" }], ["users:read"])).toEqual(["users:read"]);
    expect(grantedPermissions([], [])).toEqual([]);
  });

  it("does not let a custom role named owner widen access", () => {
    expect(grantedPermissions([{ name: "owner", isSystem: false }], ["users:read"])).toEqual(["users:read"]);
  });
});
