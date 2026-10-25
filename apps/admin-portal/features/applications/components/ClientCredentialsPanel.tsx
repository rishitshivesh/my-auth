"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, GlassCard, SentryButton } from "@repo/ui";
import { describeError } from "@/lib/api-error";
import { useCopy } from "@/i18n";
import { useRotateClientSecret } from "../api/clients";
import { apiBaseUrl } from "../api/request";
import { oidcEndpoints } from "../model/endpoints";
import { isConfidential } from "../model/clients";
import type { OAuthClient } from "../model/types";
import { CopyableValue } from "./CopyableValue";
import { EndpointsPanel } from "./EndpointsPanel";
import { OneTimeSecretDialog } from "./OneTimeSecretDialog";

export interface ClientCredentialsPanelProps {
  slug: string;
  client: OAuthClient;
  canRotate: boolean;
}

export function ClientCredentialsPanel({ slug, client, canRotate }: ClientCredentialsPanelProps) {
  const { t, tk } = useCopy();
  const rotate = useRotateClientSecret(slug, client.clientId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [secret, setSecret] = useState<string | null>(null);

  const onRotate = async () => {
    setError(undefined);
    try {
      const result = await rotate.mutateAsync();
      rotate.reset();
      setConfirmOpen(false);
      setSecret(result.clientSecret);
      toast.success(t("tenantIntegrations.apps.detail.rotated"));
    } catch (failure: unknown) {
      setError(describeError(failure).message);
    }
  };

  const items = oidcEndpoints(apiBaseUrl()).map((entry) => ({
    id: entry.id,
    label: tk(`tenantIntegrations.endpoints.${entry.id}`),
    value: entry.url,
  }));

  return (
    <div className="space-y-6">
      <GlassCard tier={1} className="space-y-4 p-6">
        <section aria-labelledby="client-credentials-heading" className="space-y-4">
          <div className="space-y-1">
            <h2 id="client-credentials-heading" className="font-display text-base font-semibold">{t("tenantIntegrations.apps.detail.credentials")}</h2>
            <p className="font-body text-sm text-muted-foreground">{t("tenantIntegrations.apps.detail.credentialsDescription")}</p>
          </div>
          <CopyableValue label={t("tenantIntegrations.common.clientId")} value={client.clientId} />
          {isConfidential(client) ? (
            canRotate && (
              <div className="space-y-2">
                <p className="font-body text-sm text-muted-foreground">{t("tenantIntegrations.apps.detail.rotateDescription")}</p>
                <SentryButton variant="outline" onClick={() => setConfirmOpen(true)}>{t("tenantIntegrations.apps.detail.rotate")}</SentryButton>
              </div>
            )
          ) : (
            <p className="font-body text-sm text-muted-foreground">{t("tenantIntegrations.apps.detail.publicNoSecret")}</p>
          )}
        </section>
      </GlassCard>
      <EndpointsPanel
        heading={t("tenantIntegrations.endpoints.heading")}
        description={t("tenantIntegrations.endpoints.description")}
        items={items}
        note={t("tenantIntegrations.endpoints.tenantNote")}
      />
      {/* TODO(gap:T12-sdk-snippets): SDK integration snippets need a tested contract before they are generated here. */}
      <p className="font-body text-xs text-muted-foreground">{t("tenantIntegrations.endpoints.snippetsGap")}</p>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => { setConfirmOpen(open); if (!open) setError(undefined); }}
        title={t("tenantIntegrations.apps.detail.rotateConfirmTitle")}
        description={t("tenantIntegrations.apps.detail.rotateConfirmDescription")}
        effectsHeading={t("common.dialog.effectHeading")}
        effects={[
          t("tenantIntegrations.apps.detail.rotateEffect1"),
          t("tenantIntegrations.apps.detail.rotateEffect2"),
          t("tenantIntegrations.apps.detail.rotateEffect3"),
        ]}
        confirmLabel={t("tenantIntegrations.apps.detail.rotateConfirm")}
        cancelLabel={t("common.actions.cancel")}
        destructive
        onConfirm={onRotate}
        pending={rotate.isPending}
        error={error}
      />
      {secret !== null && (
        <OneTimeSecretDialog
          open
          title={t("tenantIntegrations.apps.detail.rotateDone")}
          description={t("tenantIntegrations.apps.detail.rotateConfirmDescription")}
          secret={secret}
          details={<CopyableValue label={t("tenantIntegrations.common.clientId")} value={client.clientId} />}
          onAcknowledge={() => setSecret(null)}
        />
      )}
    </div>
  );
}
