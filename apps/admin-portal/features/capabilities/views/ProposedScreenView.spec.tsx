import { describe, expect, it } from "@jest/globals";
import { html } from "@/test-utils/render";
import { SCREEN_FAMILIES } from "../model/specs";
import { GlobalStateView } from "./GlobalStateView";
import { ProposedScreenView } from "./ProposedScreenView";

describe("ProposedScreenView", () => {
  it.each(SCREEN_FAMILIES)("%s renders badge, disabled controls, handoff and no rows", (family) => {
    const out = html(<ProposedScreenView family={family} />);
    expect(out).toContain("Planned");
    expect(out).toContain("TODO: handoff to implementation");
    expect(out).toContain('role="note"');
    expect(out).not.toContain("<tbody");
    expect(out).not.toMatch(/<button(?![^>]*disabled)/);
    expect(out).not.toMatch(/<input(?![^>]*disabled)/);
  });
});

describe("GlobalStateView", () => {
  it.each([["not-found", "We could not find that"], ["denied", "You do not have access"], ["unavailable", "Service unavailable"], ["error", "Something went wrong"]] as const)(
    "%s renders its title",
    (kind, title) => {
      expect(html(<GlobalStateView kind={kind} />)).toContain(title);
    },
  );

  it("offers retry only when a handler exists", () => {
    expect(html(<GlobalStateView kind="error" onRetry={() => undefined} />)).toContain("Try again");
    expect(html(<GlobalStateView kind="error" />)).not.toContain("<button");
  });
});
