"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { formatTimestamp } from "@/lib/format";
import { sanitizeMetadata, type AuditEvent } from "../model/audit";

export interface AuditEventDialogProps {
  event: AuditEvent | null;
  onClose: () => void;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className={`break-words font-body text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

export function AuditEventDialog({ event, onClose }: AuditEventDialogProps) {
  const { t } = useCopy();
  const metadata = sanitizeMetadata(event?.metadata);
  const none = t("tenantAdmin.audit.noResource");
  return (
    <Dialog open={event !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        {event && (
          <>
            <DialogHeader>
              <DialogTitle>{t("tenantAdmin.audit.detail.title")}</DialogTitle>
              <DialogDescription className="font-mono">{event.eventType}</DialogDescription>
            </DialogHeader>
            <dl className="space-y-3">
              <Row label={t("tenantAdmin.audit.detail.time")} value={formatTimestamp(event.createdAt)} />
              <Row label={t("tenantAdmin.audit.detail.actor")} value={event.actorEmail ?? t("tenantAdmin.audit.unknownActor")} />
              <Row label={t("tenantAdmin.audit.detail.userId")} value={event.userId ?? none} mono />
              <Row label={t("tenantAdmin.audit.detail.ip")} value={event.ipAddress} mono />
              <Row label={t("tenantAdmin.audit.detail.userAgent")} value={event.userAgent ?? none} />
              <Row label={t("tenantAdmin.audit.detail.resource")} value={[event.resourceType, event.resourceId].filter(Boolean).join(" / ") || none} mono />
              <Row label={t("tenantAdmin.audit.detail.requestId")} value={event.requestId ?? none} mono />
            </dl>
            <section aria-labelledby="audit-metadata" className="space-y-2">
              <h3 id="audit-metadata" className="font-display text-sm font-semibold text-foreground">{t("tenantAdmin.audit.detail.metadata")}</h3>
              <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.audit.detail.metadataNote")}</p>
              {metadata.length === 0 ? (
                <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.audit.detail.noMetadata")}</p>
              ) : (
                <dl className="space-y-2 rounded-sm border border-border bg-muted p-3">
                  {metadata.map((entry) => <Row key={entry.key} label={entry.key} value={entry.value} mono />)}
                </dl>
              )}
            </section>
            <SentryButton variant="outline" onClick={onClose}>{t("tenantAdmin.audit.detail.close")}</SentryButton>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
