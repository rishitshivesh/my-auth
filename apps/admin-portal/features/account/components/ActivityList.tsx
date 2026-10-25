"use client";

import type { SecurityEvent } from "@scrolloop/sdk";
import { cn } from "@repo/ui/lib/utils";
import { useCopy } from "@/i18n";
import { eventLabelKey, eventPlace, severityKey, severityTone } from "../model/activity";
import { elapsedSince, formatRelative } from "../model/sessions";

export interface ActivityListProps {
  events: readonly SecurityEvent[];
  now: number;
}

/** Event, severity (text, never colour alone), place and time. Semantic list so it reflows. */
export function ActivityList({ events, now }: ActivityListProps) {
  const { t, tk } = useCopy();
  const unknown = t("account.activity.unknownLocation");
  return (
    <ul className="divide-y divide-border rounded-sm border border-border" aria-label={t("account.activity.title")}>
      {events.map((event) => {
        const severity = severityKey(event.severity);
        const tone = severityTone(severity);
        return (
          <li key={event.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
            <div className="min-w-0 space-y-1">
              <p className="font-body text-sm font-medium text-foreground">{tk(eventLabelKey(event.eventType))}</p>
              <p className="break-words font-body text-xs text-muted-foreground">
                {t("account.activity.columns.where")}: {eventPlace(event) ?? unknown}
              </p>
            </div>
            <div className="flex items-center gap-3 text-right">
              <span
                className={cn(
                  "rounded-sm border px-2 py-0.5 font-body text-xs font-medium",
                  tone === "danger" && "border-destructive text-destructive",
                  tone === "warning" && "border-warning text-warning-text",
                  tone === "neutral" && "border-border text-muted-foreground",
                )}
              >
                {t(`account.activity.severity.${severity}`)}
              </span>
              <time dateTime={event.createdAt} className="font-body text-xs text-muted-foreground">
                {formatRelative(elapsedSince(event.createdAt, now), t("account.sessions.now"), unknown)}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
