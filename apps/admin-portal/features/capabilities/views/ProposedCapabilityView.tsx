"use client";

import { ProposedCapability } from "@repo/ui";
import { capabilityCopy, type CapabilityId } from "@/constants/feature-flags";
import { useCopy } from "@/i18n";

/** Pages for proposed capabilities render only this: no data, no actions. */
export function ProposedCapabilityView({ id }: { id: CapabilityId }) {
  const { t, tk } = useCopy();
  const keys = capabilityCopy(id);
  return (
    <ProposedCapability
      title={tk(keys.title)}
      summary={tk(keys.summary)}
      badgeLabel={t("states.proposed.badge")}
      intro={t("states.proposed.intro")}
      todoHeading={t("states.proposed.todoHeading")}
      requirements={keys.requirements.map((key) => tk(key))}
      contractHeading={t("states.proposed.contractHeading")}
      missingContract={tk(keys.contract)}
    />
  );
}
