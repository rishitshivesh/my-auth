import { GlassCard, SentryButton, StateView, StatusBadge, type ResourceStatus } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { SocialRow } from "../model/social";

export interface SocialProvidersListProps {
  rows: readonly SocialRow[];
  status: ResourceStatus;
  canWrite: boolean;
  onRetry: () => void;
  onConfigure: (row: SocialRow) => void;
}

export function SocialProvidersList({ rows, status, canWrite, onRetry, onConfigure }: SocialProvidersListProps) {
  const { t, tk } = useCopy();
  if (status === "loading") return <StateView kind="loading" title={t("tenantIntegrations.connections.loading")} />;
  if (status === "denied") {
    return <StateView kind="denied" title={t("tenantIntegrations.common.deniedTitle")} description={t("tenantIntegrations.common.deniedDescription")} />;
  }
  if (status !== "ready") {
    return (
      <StateView
        kind="error"
        title={t("tenantIntegrations.common.errorTitle")}
        description={t("tenantIntegrations.common.errorDescription")}
        action={{ label: t("common.actions.retry"), onClick: onRetry }}
      />
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        const name = tk(`tenantIntegrations.connections.provider.${row.provider}`);
        return (
          <li key={row.provider}>
            <GlassCard tier={1} className="flex h-full flex-col gap-3 p-5">
              <h3 className="font-display text-base font-semibold text-foreground">{name}</h3>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={row.enabled ? "active" : "system"}>
                  {t(row.enabled ? "tenantIntegrations.connections.enabled" : "tenantIntegrations.connections.disabled")}
                </StatusBadge>
                <StatusBadge status={row.configured ? "mfa" : "pending"}>
                  {t(row.configured ? "tenantIntegrations.connections.configured" : "tenantIntegrations.connections.notConfigured")}
                </StatusBadge>
              </div>
              {row.clientId && <code className="break-all font-mono text-xs text-muted-foreground">{row.clientId}</code>}
              {row.hasClientSecret && <p className="font-body text-xs text-muted-foreground">{t("tenantIntegrations.connections.secretStored")}</p>}
              {canWrite && (
                <SentryButton
                  variant="outline"
                  className="mt-auto"
                  onClick={() => onConfigure(row)}
                  aria-label={t("tenantIntegrations.connections.form.title", { provider: name })}
                >
                  {t("tenantIntegrations.connections.configure")}
                </SentryButton>
              )}
            </GlassCard>
          </li>
        );
      })}
    </ul>
  );
}
