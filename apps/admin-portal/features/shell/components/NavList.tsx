"use client";

import { NavItem } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { NavSection } from "../model/nav";

export function NavList({ sections }: { sections: readonly NavSection[] }) {
  const { tk } = useCopy();
  return (
    <>
      {sections.map((section, index) => (
        <div key={section.key ?? index} className="flex flex-col gap-1">
          {section.key && (
            <p className="px-3 pb-1 pt-3 font-display text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {tk(section.key)}
            </p>
          )}
          {section.entries.map((entry) => (
            <NavItem key={entry.id} href={entry.href} icon={entry.icon} label={tk(entry.labelKey)} />
          ))}
        </div>
      ))}
    </>
  );
}
