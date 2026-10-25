"use client";

import { useMemo, useState } from "react";
import { SentryButton, StateView } from "@repo/ui";
import { SECURITY_EVENTS_MAX, SECURITY_EVENTS_PAGE_SIZE } from "@/constants/limits";
import { useCopy } from "@/i18n";
import { useSecurityEventsQuery } from "../api/use-account-queries";
import { ActivityList } from "../components/ActivityList";
import { queryStatus, ResourceBoundary } from "../components/ResourceBoundary";
import { SecurityTabs } from "../components/SecurityTabs";
import { sortEvents } from "../model/activity";
import { PageFrame } from "@/components/page/PageFrame";

/**
 * Personal security events. The API supports only `limit`, so there are no date or type
 * filters; "Show more" raises the limit.
 */
export function ActivityView() {
  const { t } = useCopy();
  const [limit, setLimit] = useState<number>(SECURITY_EVENTS_PAGE_SIZE);
  const query = useSecurityEventsQuery(limit);
  const events = useMemo(() => sortEvents(query.data ?? []), [query.data]);
  const canShowMore = limit < SECURITY_EVENTS_MAX && (query.data?.length ?? 0) >= limit;

  return (
    <PageFrame size="narrow" title={t("account.activity.title")} subtitle={t("account.activity.description")}>
      <SecurityTabs current="activity" />
      <ResourceBoundary
        status={queryStatus(query)}
        loadingTitle={t("account.activity.loading")}
        errorTitle={t("account.activity.loadFailed")}
        retryLabel={t("common.actions.retry")}
        onRetry={() => void query.refetch()}
      >
        {events.length === 0 ? (
          <StateView kind="empty" title={t("account.activity.empty")} description={t("account.activity.emptyHint")} />
        ) : (
          <ActivityList events={events} now={query.dataUpdatedAt || 0} />
        )}
        {canShowMore && (
          <SentryButton variant="outline" isLoading={query.isFetching} onClick={() => setLimit((l) => Math.min(l + SECURITY_EVENTS_PAGE_SIZE, SECURITY_EVENTS_MAX))}>
            {t("account.activity.showMore")}
          </SentryButton>
        )}
      </ResourceBoundary>
    </PageFrame>
  );
}
