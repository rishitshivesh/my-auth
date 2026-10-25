import { describe, expect, it } from "@jest/globals";
import { CAPABILITY_IDS } from "@/constants/feature-flags";
import { tenantRoutes } from "@/constants/routes";
import { t, tk } from "@/i18n/use-copy";
import { SCREEN_FAMILIES, SCREEN_SPECS } from "./specs";
import { isPlannedShell, missingHandoffParts } from "./validate";

describe("proposed capability specs", () => {
  it("covers N05, N07, N09 and N13", () => {
    expect(SCREEN_FAMILIES.map((f) => SCREEN_SPECS[f].checklistId).sort()).toEqual(["N05", "N07", "N09", "N13"]);
  });

  it.each(SCREEN_FAMILIES)("%s has a complete handoff and resolves every copy key", (family) => {
    const spec = SCREEN_SPECS[family];
    expect(missingHandoffParts(spec)).toEqual([]);
    expect(CAPABILITY_IDS).toContain(spec.capability);
    const keys = [spec.title, spec.summary, spec.purpose, spec.persona, ...spec.acceptance,
      ...spec.sections.flatMap((s) => [s.heading, s.empty, ...(s.columns ?? []), ...(s.tiles ?? []), ...(s.fields ?? []), ...(s.actions ?? [])])];
    for (const key of keys) expect(tk(key)).not.toBe(key);
  });

  it("stays a planned shell while flags are off", () => {
    for (const family of SCREEN_FAMILIES) expect(isPlannedShell(SCREEN_SPECS[family])).toBe(true);
  });

  it("uses well-formed contract routes", () => {
    for (const family of SCREEN_FAMILIES) {
      for (const route of SCREEN_SPECS[family].contracts) expect(route.path.startsWith("/")).toBe(true);
    }
    expect(tenantRoutes("acme").billing()).toBe("/t/acme/billing");
    expect(t("capabilities.common.planned")).toBe("Planned");
  });
});
