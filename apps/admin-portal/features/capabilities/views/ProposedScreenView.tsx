"use client";

import { useCopy } from "@/i18n";
import { HandoffBlock } from "../components/HandoffBlock";
import { SectionBlock } from "../components/SectionBlock";
import { SCREEN_SPECS } from "../model/specs";
import type { ScreenFamily } from "../model/types";

/**
 * Real screen layout for a proposed capability: Planned badge, designed
 * structure without data, disabled controls, and the written handoff.
 */
export function ProposedScreenView({ family }: { family: ScreenFamily }) {
  const { t, tk } = useCopy();
  const spec = SCREEN_SPECS[family];
  const noticeId = `cap-${family}-notice`;
  return (
    <div className="space-y-5" data-capability-screen={family}>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-semibold text-foreground">{tk(spec.title)}</h1>
          <span className="inline-flex items-center rounded-xs border border-border bg-muted px-2 py-0.5 font-display text-[11px] font-semibold text-muted-foreground">
            {t("capabilities.common.planned")}
          </span>
        </div>
        <p className="font-body text-sm text-muted-foreground">{tk(spec.summary)}</p>
        <p id={noticeId} role="note" className="rounded-sm border border-dashed border-warning/60 bg-muted p-3 font-body text-sm text-foreground">
          {t("capabilities.common.notice")}
        </p>
      </header>
      {spec.sections.map((section) => (
        <SectionBlock key={section.id} section={section} noticeId={noticeId} />
      ))}
      <HandoffBlock spec={spec} />
    </div>
  );
}
