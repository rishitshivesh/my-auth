import type { ReactNode } from "react";
import { StateView } from "@repo/ui";

export interface ResourceBoundaryProps {
  status: "loading" | "error" | "ready";
  loadingTitle: string;
  errorTitle: string;
  retryLabel: string;
  onRetry: () => void;
  children: ReactNode;
}

/** Loading, failure with retry, or content. Never renders content while unknown. */
export function ResourceBoundary({ status, loadingTitle, errorTitle, retryLabel, onRetry, children }: ResourceBoundaryProps) {
  if (status === "loading") return <StateView kind="loading" title={loadingTitle} />;
  if (status === "error") {
    return <StateView kind="error" title={errorTitle} action={{ label: retryLabel, onClick: onRetry }} />;
  }
  return <>{children}</>;
}

export function queryStatus(q: { isPending: boolean; isError: boolean }): ResourceBoundaryProps["status"] {
  if (q.isPending) return "loading";
  return q.isError ? "error" : "ready";
}
