import { describe, expect, it } from "@jest/globals";
import { accessImpact, assignablePermissions, diffSelection, hasChanges, permissionNamesOf, roleLabel } from "./role-diff";
import { groupByResource, validatePermissionForm } from "./permission-catalog";
import { formatPolicy, hasExplicitDeny, newPolicyTemplate, parsePolicyJson, summarizeStatements } from "./policy-document";
import { buildSimulationRequest, toSimulationView, validateSimulation } from "./simulation";
import { flattenGroups } from "./group-tree";
import type { GroupDto, PermissionDto, RoleDto, SimulationResultDto } from "./types";

const perm = (name: string, over: Partial<PermissionDto> = {}): PermissionDto => {
  const [resource = "", action = ""] = name.split(":");
  return { id: name, name, resource, action, scope: "tenant", isSystem: false, ...over };
};
const role = (name: string, perms: string[]): RoleDto => ({
  id: name, name, isSystem: false, isActive: true, isDefault: false, priority: 1,
  rolePermissions: perms.map((p) => ({ permission: perm(p) })),
});

describe("role selection diff", () => {
  it("reports added, removed and unchanged names regardless of order", () => {
    const diff = diffSelection(["b", "a"], ["c", "a"]);
    expect(diff).toEqual({ added: ["c"], removed: ["b"], unchanged: ["a"] });
    expect(hasChanges(diff)).toBe(true);
  });
  it("is empty when nothing changed", () => {
    expect(hasChanges(diffSelection(["a"], ["a"]))).toBe(false);
  });
  it("computes gained and lost permissions across roles", () => {
    const viewer = role("viewer", ["users:read"]);
    const admin = role("admin", ["users:read", "users:write"]);
    expect(accessImpact([viewer], [admin])).toEqual({ gained: ["users:write"], lost: [] });
    expect(accessImpact([admin], [viewer])).toEqual({ gained: [], lost: ["users:write"] });
  });
  it("de-duplicates permission names", () => {
    expect(permissionNamesOf([role("a", ["x:y"]), role("b", ["x:y", "a:b"])])).toEqual(["a:b", "x:y"]);
  });
  it("prefers the display name", () => {
    expect(roleLabel({ name: "adm", displayName: " Admin " })).toBe("Admin");
    expect(roleLabel({ name: "adm", displayName: null })).toBe("adm");
  });
  it("lists permissions a role does not hold yet", () => {
    const r = role("r", ["a:b"]);
    expect(assignablePermissions([perm("a:b"), perm("c:d")], r).map((p) => p.name)).toEqual(["c:d"]);
  });
});

describe("permission catalog", () => {
  const all = [perm("users:write"), perm("users:read", { description: "Read people" }), perm("audit:read")];
  it("groups by resource and sorts", () => {
    const groups = groupByResource(all);
    expect(groups.map((g) => g.resource)).toEqual(["audit", "users"]);
    expect(groups[1]?.permissions.map((p) => p.name)).toEqual(["users:read", "users:write"]);
  });
  it("filters by name or description", () => {
    expect(groupByResource(all, "people")[0]?.permissions).toHaveLength(1);
    expect(groupByResource(all, "zzz")).toEqual([]);
  });
  it("validates resource and action identifiers", () => {
    expect(validatePermissionForm({ resource: "Bad Name", action: "", description: "" })).toEqual({
      resource: "format", action: "required",
    });
    expect(validatePermissionForm({ resource: "reports", action: "export", description: "" })).toEqual({});
  });
});

describe("policy document", () => {
  it("rejects invalid JSON and wrong shapes", () => {
    expect(parsePolicyJson("{")).toEqual({ ok: false, issues: [{ code: "invalidJson" }] });
    expect(parsePolicyJson("[]")).toEqual({ ok: false, issues: [{ code: "notObject" }] });
  });
  it("reports each statement problem with its index", () => {
    const result = parsePolicyJson(JSON.stringify({ Version: "1", Statement: [{ Effect: "Maybe", Action: "", Resource: "*" }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        { code: "effect", statement: 0 },
        { code: "action", statement: 0 },
      ]);
    }
  });
  it("round-trips the template", () => {
    const result = parsePolicyJson(formatPolicy(newPolicyTemplate()));
    expect(result.ok).toBe(true);
  });
  it("summarises statements and detects explicit deny", () => {
    const doc = { Version: "1", Statement: [{ Effect: "Deny" as const, Action: "a:b", Resource: ["*"], Condition: { Bool: {} } }] };
    expect(hasExplicitDeny(doc)).toBe(true);
    expect(summarizeStatements(doc)[0]).toMatchObject({ effect: "Deny", actions: ["a:b"], hasCondition: true });
  });
});

describe("simulation", () => {
  const base = { userId: "u1", action: "users:read", resource: "*", ipAddress: "", mfaVerified: false };
  it("validates required fields, action format and IP", () => {
    expect(validateSimulation({ ...base, userId: "", action: "nope", ipAddress: "300.1.1.1" })).toEqual({
      userId: "required", action: "actionFormat", ipAddress: "ipFormat",
    });
    expect(validateSimulation(base)).toEqual({});
  });
  it("omits an empty IP from the request", () => {
    expect(buildSimulationRequest(base)).toEqual({ userId: "u1", action: "users:read", resource: "*", mfaVerified: false });
    expect(buildSimulationRequest({ ...base, ipAddress: " 10.0.0.1 " }).ipAddress).toBe("10.0.0.1");
  });
  it("explains a boundary denial and separates near misses", () => {
    const result: SimulationResultDto = {
      allowed: false, reason: "boundary_deny", deniedBy: ["Boundary"], policiesEvaluated: 2,
      trace: [
        { policyName: "P", effect: "Allow", actionMatch: true, resourceMatch: true, conditionMatch: false, applies: false },
        { policyName: "P", effect: "Allow", actionMatch: false, resourceMatch: false, conditionMatch: true, applies: false },
      ],
    };
    const view = toSimulationView(result);
    expect(view.outcome).toBe("deny");
    expect(view.explanation).toBe("boundaryDeny");
    expect(view.nearMisses).toHaveLength(1);
    expect(view.decisive).toEqual(["Boundary"]);
  });
  it("treats a missing trace as empty rather than inventing one", () => {
    const view = toSimulationView({ allowed: true, reason: "explicit_allow" } as SimulationResultDto);
    expect(view.applied).toEqual([]);
    expect(view.policiesEvaluated).toBe(0);
  });
});

describe("group tree", () => {
  const g = (id: string, name: string, parentGroupId: string | null): GroupDto => ({
    id, name, parentGroupId, description: null, path: name, isSystem: false, createdAt: "",
  });
  it("orders children under parents with depth", () => {
    const flat = flattenGroups([g("c", "Child", "p"), g("p", "Parent", null), g("o", "Other", null)]);
    expect(flat.map((n) => [n.group.id, n.depth])).toEqual([["o", 0], ["p", 0], ["c", 1]]);
  });
  it("does not loop on cycles and keeps orphans at the root", () => {
    const flat = flattenGroups([g("a", "A", "b"), g("b", "B", "a"), g("x", "X", "missing")]);
    expect(flat.map((n) => n.group.id)).toEqual(["x"]);
  });
});

import { isProtectedRole, validateRoleForm } from "./role-form";

describe("role form", () => {
  it("requires a machine-friendly name only when creating", () => {
    expect(validateRoleForm({ name: "", displayName: "", description: "" }, "create")).toEqual({ name: "required" });
    expect(validateRoleForm({ name: "Bad Name", displayName: "", description: "" }, "create")).toEqual({ name: "format" });
    expect(validateRoleForm({ name: "", displayName: "Ok", description: "" }, "edit")).toEqual({});
    expect(validateRoleForm({ name: "support-lead", displayName: "x".repeat(65), description: "" }, "create")).toEqual({
      displayName: "tooLong",
    });
  });
  it("treats system roles as protected", () => {
    expect(isProtectedRole({ isSystem: true })).toBe(true);
    expect(isProtectedRole({ isSystem: false })).toBe(false);
  });
});

import { evaluatePolicyForm, initialPolicyForm } from "./policy-form";

describe("policy form", () => {
  it("starts create mode from a valid template", () => {
    const state = evaluatePolicyForm({ ...initialPolicyForm(), name: "reader" }, "create");
    expect(state.canSubmit).toBe(true);
  });
  it("blocks submit on a missing name or broken JSON", () => {
    expect(evaluatePolicyForm(initialPolicyForm(), "create")).toMatchObject({ nameError: "required", canSubmit: false });
    expect(evaluatePolicyForm({ ...initialPolicyForm(), name: "x", json: "{" }, "create").canSubmit).toBe(false);
  });
  it("does not require a name when editing", () => {
    expect(evaluatePolicyForm({ ...initialPolicyForm(), name: "" }, "edit").canSubmit).toBe(true);
  });
});

import { validateGroupForm } from "./group-form";

describe("group form", () => {
  it("requires a name and limits lengths", () => {
    expect(validateGroupForm({ name: " ", description: "", parentGroupId: "" })).toEqual({ name: "required" });
    expect(validateGroupForm({ name: "Ops", description: "x".repeat(256), parentGroupId: "" })).toEqual({ description: "tooLong" });
    expect(validateGroupForm({ name: "Ops", description: "", parentGroupId: "" })).toEqual({});
  });
});
