import type { NavEntry } from "@/constants/navigation";
import type { CommandGroupData } from "@repo/ui";

/** Palette entries derived from visible navigation; actions are added by the shell. */
export function navCommandGroup(
  id: string,
  heading: string,
  entries: readonly NavEntry[],
  label: (entry: NavEntry) => string,
  go: (href: string) => void,
): CommandGroupData {
  return {
    id,
    heading,
    entries: entries.map((entry) => ({
      id: entry.id,
      label: label(entry),
      icon: entry.icon,
      onSelect: () => go(entry.href),
    })),
  };
}
