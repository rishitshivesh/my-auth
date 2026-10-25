import { describe, expect, it } from "@jest/globals";
import { html } from "@/test-utils/render";
import { ChangeList } from "./ChangeList";
import { PermissionList } from "./PermissionList";
import { SimulationResultPanel } from "./SimulationResultPanel";
import { toSimulationView } from "../model/simulation";
import type { PermissionDto, SimulationResultDto } from "../model/types";

const perm = (name: string): PermissionDto => {
  const [resource = "", action = ""] = name.split(":");
  return { id: name, name, resource, action, scope: "tenant", isSystem: false };
};

describe("PermissionList", () => {
  it("groups by resource under a labelled group", () => {
    const out = html(<PermissionList permissions={[perm("users:read"), perm("audit:read")]} label="Effective" emptyText="None" />);
    expect(out).toContain('aria-label="Effective"');
    expect(out.indexOf("audit")).toBeLessThan(out.indexOf("users"));
  });
  it("shows the empty text and a text marker for highlights", () => {
    expect(html(<PermissionList permissions={[]} label="x" emptyText="Nothing granted" />)).toContain("Nothing granted");
    const marked = html(<PermissionList permissions={[perm("a:b")]} label="x" emptyText="" highlight={new Set(["a:b"])} highlightLabel="New" />);
    expect(marked).toContain("New");
  });
});

describe("ChangeList", () => {
  it("renders a marker that is hidden from assistive tech and an empty state", () => {
    expect(html(<ChangeList label="Added" names={["a"]} marker="+" emptyText="none" />)).toContain('aria-hidden="true"');
    expect(html(<ChangeList label="Added" names={[]} marker="+" emptyText="none" />)).toContain("none");
  });
});

describe("SimulationResultPanel", () => {
  const base: SimulationResultDto = { allowed: false, reason: "implicit_deny", policiesEvaluated: 1, trace: [] };
  it("announces the decision politely and explains an implicit deny", () => {
    const out = html(<SimulationResultPanel view={toSimulationView(base)} />);
    expect(out).toContain('role="status"');
    expect(out).toContain("Denied");
    expect(out).toContain("No policy applied");
  });
  it("shows the boundary note and near misses", () => {
    const out = html(
      <SimulationResultPanel
        view={toSimulationView({
          ...base, reason: "boundary_deny", deniedBy: ["Cap"],
          trace: [{ policyName: "P", effect: "Allow", actionMatch: true, resourceMatch: true, conditionMatch: false, applies: false }],
        })}
      />,
    );
    expect(out).toContain("permission boundary");
    expect(out).toContain("Near misses");
    expect(out).toContain("Did not match: condition");
    expect(out).toContain("Cap");
  });
  it("shows an allow", () => {
    const out = html(<SimulationResultPanel view={toSimulationView({ ...base, allowed: true, reason: "explicit_allow", allowedBy: ["Reader"] })} />);
    expect(out).toContain("Allowed");
    expect(out).toContain("Reader");
  });
});
