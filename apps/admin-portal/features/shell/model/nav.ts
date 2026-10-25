import type { NavEntry } from "@/constants/navigation";
import type { CopyKey } from "@/i18n";

export interface NavSection {
  key: CopyKey | undefined;
  entries: readonly NavEntry[];
}

/**
 * Hide entries the user clearly cannot use. While permissions are unknown
 * everything stays visible (no flash of missing nav); the backend still enforces.
 */
export function visibleEntries(
  entries: readonly NavEntry[],
  can: (permission: string) => boolean,
  isReady: boolean,
): readonly NavEntry[] {
  if (!isReady) return entries;
  return entries.filter((entry) => !entry.permission || can(entry.permission));
}

/** Group consecutive entries by section, preserving order. */
export function groupBySection(entries: readonly NavEntry[]): readonly NavSection[] {
  const sections: { key: CopyKey | undefined; entries: NavEntry[] }[] = [];
  for (const entry of entries) {
    const last = sections[sections.length - 1];
    if (last && last.key === entry.sectionKey) last.entries.push(entry);
    else sections.push({ key: entry.sectionKey, entries: [entry] });
  }
  return sections;
}
