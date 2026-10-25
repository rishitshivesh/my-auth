"use client";

import { PageHeader, ProposedCapability } from "@repo/ui";
import { useCopy } from "@/i18n";

/** Cross-tenant people lookup has no backend contract; this renders the honest handoff (TODO(gap:P07)). */
export function PeopleView() {
  const { t } = useCopy();
  return (
    <div className="space-y-6">
      <PageHeader title={t("platform.people.title")} subtitle={t("platform.people.subtitle")} className="mb-0" />
      <ProposedCapability
        title={t("platform.people.gapTitle")}
        summary={t("platform.people.gapSummary")}
        badgeLabel={t("platform.people.badge")}
        intro={t("platform.people.intro")}
        todoHeading={t("platform.people.todoHeading")}
        requirements={[t("platform.people.gapReqs.one"), t("platform.people.gapReqs.two"), t("platform.people.gapReqs.three")]}
        contractHeading={t("platform.people.contractHeading")}
        missingContract={t("platform.people.gapContract")}
      />
    </div>
  );
}
