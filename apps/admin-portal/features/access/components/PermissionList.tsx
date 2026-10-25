import { groupByResource } from "../model/permission-catalog";
import type { PermissionDto } from "../model/types";

export interface PermissionListProps {
  permissions: readonly PermissionDto[];
  /** Heading level text for assistive tech, e.g. "Effective permissions". */
  label: string;
  emptyText: string;
  /** Names to flag (e.g. gained) alongside a text marker, never colour alone. */
  highlight?: ReadonlySet<string>;
  highlightLabel?: string;
}

/** Permissions grouped by resource, names in the mono role. Presentational and copy-free. */
export function PermissionList({ permissions, label, emptyText, highlight, highlightLabel }: PermissionListProps) {
  const groups = groupByResource(permissions);
  if (groups.length === 0) return <p className="font-body text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div role="group" aria-label={label} className="space-y-4">
      {groups.map((group) => (
        <section key={group.resource} className="space-y-1.5">
          <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.resource}
          </h4>
          <ul className="flex flex-wrap gap-2">
            {group.permissions.map((permission) => (
              <li
                key={permission.id}
                title={permission.description ?? undefined}
                className="max-w-full break-all rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground"
              >
                {permission.name}
                {highlight?.has(permission.name) && highlightLabel && (
                  <span className="ml-2 font-display text-xs font-semibold text-foreground">{highlightLabel}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
