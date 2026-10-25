import type { GroupDto } from "./types";

export interface GroupNode {
  group: GroupDto;
  depth: number;
}

/** Depth-first flattening so the table shows hierarchy; orphans are shown at the root. */
export function flattenGroups(groups: readonly GroupDto[]): GroupNode[] {
  const ids = new Set(groups.map((g) => g.id));
  const children = new Map<string | null, GroupDto[]>();
  for (const group of groups) {
    const parent = group.parentGroupId && ids.has(group.parentGroupId) ? group.parentGroupId : null;
    children.set(parent, [...(children.get(parent) ?? []), group]);
  }
  const out: GroupNode[] = [];
  const visit = (parent: string | null, depth: number, seen: ReadonlySet<string>) => {
    const siblings = [...(children.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const group of siblings) {
      if (seen.has(group.id)) continue; // defensive: never loop on bad data
      out.push({ group, depth });
      visit(group.id, depth + 1, new Set([...seen, group.id]));
    }
  };
  visit(null, 0, new Set());
  return out;
}
