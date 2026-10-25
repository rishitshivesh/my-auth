"use client";

import { StateView, type ResourceStatus } from "@repo/ui";

export interface PageStateLabels {
  loading: string;
  deniedTitle: string;
  deniedBody: string;
  errorTitle: string;
  errorBody: string;
  unavailableTitle: string;
  unavailableBody: string;
  retry: string;
}

export interface PageStateProps {
  status: Exclude<ResourceStatus, "ready">;
  labels: PageStateLabels;
  onRetry: () => void;
}

/** Full-width loading/denied/error/unavailable block for a page-level query. */
export function PageState({ status, labels, onRetry }: PageStateProps) {
  const retry = { label: labels.retry, onClick: onRetry };
  switch (status) {
    case "loading":
      return <StateView kind="loading" title={labels.loading} />;
    case "denied":
      return <StateView kind="denied" title={labels.deniedTitle} description={labels.deniedBody} />;
    case "unavailable":
      return <StateView kind="unavailable" title={labels.unavailableTitle} description={labels.unavailableBody} action={retry} />;
    default:
      return <StateView kind="error" title={labels.errorTitle} description={labels.errorBody} action={retry} />;
  }
}
