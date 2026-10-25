"use client";

import { useCopy } from "@/i18n";
import { formatTimestamp } from "@/lib/format";
import type { ActivityItem } from "../model/types";

/** Compact recent-activity list used on the overview and workspace detail. */
export function ActivityList({ items, empty }: { items: readonly ActivityItem[]; empty: string }) {
  const { t } = useCopy();
  if (items.length === 0) return <p className="font-body text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
          <div className="min-w-0">
            <p className="break-all font-mono text-xs text-foreground">{item.eventType}</p>
            <p className="font-body text-xs text-muted-foreground">{item.actorEmail || t("platform.common.unknownActor")}</p>
          </div>
          <time dateTime={item.createdAt} className="font-body text-xs text-muted-foreground">{formatTimestamp(item.createdAt)}</time>
        </li>
      ))}
    </ul>
  );
}
