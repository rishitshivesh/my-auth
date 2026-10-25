import { GlassCard, SentryButton, SentryInput } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { SectionSpec } from "../model/types";

export interface SectionBlockProps {
  section: SectionSpec;
  /** Id of the element that explains why controls are disabled. */
  noticeId: string;
}

/** Designed structure of one block: headers and disabled controls, never rows or values. */
export function SectionBlock({ section, noticeId }: SectionBlockProps) {
  const { t, tk } = useCopy();
  const headingId = `cap-${section.id}-heading`;
  return (
    <GlassCard tier={1} className="space-y-4 p-5" aria-labelledby={headingId} role="region" data-section={section.id}>
      <h2 id={headingId} className="font-display text-base font-semibold text-foreground">{tk(section.heading)}</h2>
      {section.tiles && (
        <dl className="grid gap-3 sm:grid-cols-3">
          {section.tiles.map((key) => (
            <div key={key} className="rounded-sm border border-border bg-muted p-3">
              <dt className="font-body text-xs text-muted-foreground">{tk(key)}</dt>
              <dd className="font-body text-sm text-muted-foreground">{t("capabilities.common.tilePlaceholder")}</dd>
            </div>
          ))}
        </dl>
      )}
      {section.fields && (
        <div className="grid gap-3 sm:grid-cols-2">
          {section.fields.map((key) => (
            <SentryInput key={key} label={tk(key)} disabled aria-describedby={noticeId} />
          ))}
        </div>
      )}
      {section.columns && (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[32rem] text-left font-body text-sm">
            <caption className="sr-only">{tk(section.heading)}</caption>
            <thead className="bg-muted">
              <tr>
                {section.columns.map((key) => (
                  <th key={key} scope="col" className="px-3 py-2 font-display text-xs font-semibold text-muted-foreground">
                    {tk(key)}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
      )}
      <p className="font-body text-sm text-muted-foreground">{tk(section.empty)}</p>
      {section.actions && (
        <div className="flex flex-wrap gap-3">
          {section.actions.map((key) => (
            <SentryButton key={key} variant="outline" size="sm" disabled aria-describedby={noticeId}>
              {tk(key)}
            </SentryButton>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
