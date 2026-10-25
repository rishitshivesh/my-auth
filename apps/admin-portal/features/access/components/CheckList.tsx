"use client";

import { useId } from "react";
import { cn } from "@repo/ui/lib/utils";

export interface CheckItem {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Short non-colour cue such as "System". */
  badge?: string;
}

export interface CheckListProps {
  legend: string;
  items: readonly CheckItem[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  emptyText: string;
  className?: string;
}

/** Native checkbox group: keyboard and screen-reader support for free; scrolls on long lists. */
export function CheckList({ legend, items, selected, onToggle, emptyText, className }: CheckListProps) {
  const uid = useId();
  return (
    <fieldset className={cn("min-w-0 space-y-2", className)}>
      <legend className="font-display text-[13px] font-medium text-foreground">{legend}</legend>
      {items.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-sm border border-border">
          {items.map((item) => {
            const id = `${uid}-${item.id}`;
            return (
              <li key={item.id}>
                <label htmlFor={id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-muted">
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                    checked={selected.has(item.id)}
                    disabled={item.disabled}
                    onChange={() => onToggle(item.id)}
                  />
                  <span className="min-w-0">
                    <span className="block break-words font-body text-sm text-foreground">
                      {item.label}
                      {item.badge && (
                        <span className="ml-2 rounded-sm border border-border px-1.5 py-0.5 font-display text-xs text-muted-foreground">
                          {item.badge}
                        </span>
                      )}
                    </span>
                    {item.description && (
                      <span className="block break-words font-body text-xs text-muted-foreground">{item.description}</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
