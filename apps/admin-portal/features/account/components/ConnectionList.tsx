"use client";

import { SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { formatDate } from "../model/sessions";
import { providerLabelKey, type ProviderRow, type SocialProviderId } from "../model/social";

export interface ConnectionListProps {
  rows: readonly ProviderRow[];
  /** Provider currently redirecting for linking. */
  linking?: SocialProviderId;
  onConnect: (provider: SocialProviderId) => void;
  onDisconnect: (provider: SocialProviderId) => void;
}

export function ConnectionList({ rows, linking, onConnect, onDisconnect }: ConnectionListProps) {
  const { t, tk } = useCopy();
  return (
    <ul className="divide-y divide-border rounded-sm border border-border">
      {rows.map(({ provider, connection }) => {
        const name = tk(providerLabelKey(provider));
        return (
          <li key={provider} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-body text-sm font-medium text-foreground">
                {connection ? t("account.social.connected", { provider: name }) : name}
                {connection?.primary && (
                  <span className="ml-2 rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                    {t("account.social.primary")}
                  </span>
                )}
              </p>
              {connection && (
                <p className="break-all font-body text-xs text-muted-foreground">
                  {t("account.social.connectedAs", { email: connection.email })}
                  {connection.lastUsedAt && (
                    <>
                      {" · "}
                      {t("account.social.lastUsed", { date: formatDate(connection.lastUsedAt, "") })}
                    </>
                  )}
                </p>
              )}
            </div>
            {connection ? (
              <SentryButton
                variant="outline"
                size="sm"
                aria-label={t("account.social.disconnectLabel", { provider: name })}
                onClick={() => onDisconnect(provider)}
              >
                {t("account.social.disconnect")}
              </SentryButton>
            ) : (
              <SentryButton variant="outline" size="sm" isLoading={linking === provider} disabled={linking !== undefined} onClick={() => onConnect(provider)}>
                {t("account.social.connect", { provider: name })}
              </SentryButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}
