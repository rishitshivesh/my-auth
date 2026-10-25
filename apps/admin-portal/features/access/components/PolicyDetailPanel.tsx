"use client";

import { SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { formatPolicy, hasExplicitDeny, summarizeStatements } from "../model/policy-document";
import type { PolicyDto } from "../model/types";

export interface PolicyDetailPanelProps {
  policy: PolicyDto;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function PolicyDetailPanel({ policy, canWrite, onEdit, onDelete }: PolicyDetailPanelProps) {
  const { t } = useCopy();
  const statements = summarizeStatements(policy.document);
  const locked = policy.isSystem;
  return (
    <section aria-labelledby="policy-detail-title" className="space-y-5 rounded-md border border-border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="policy-detail-title" className="break-words font-display text-lg font-semibold text-foreground">{policy.name}</h2>
          {policy.description && <p className="break-words font-body text-sm text-muted-foreground">{policy.description}</p>}
          <p className="font-body text-xs text-muted-foreground">
            {t(`access.policies.editor.types.${policy.type}`)}
            {locked && ` · ${t("access.roles.badges.system")}`}
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <SentryButton variant="outline" size="sm" disabled={locked} onClick={onEdit}>{t("access.roles.detail.edit")}</SentryButton>
            <SentryButton variant="destructive" size="sm" disabled={locked} onClick={onDelete}>{t("access.roles.detail.delete")}</SentryButton>
          </div>
        )}
      </header>
      {hasExplicitDeny(policy.document) && (
        <p role="note" className="rounded-sm border border-border bg-muted p-3 font-body text-sm text-foreground">{t("access.policies.denyNote")}</p>
      )}
      <section aria-label={t("access.policies.detail.statements")} className="space-y-2">
        <h3 className="font-display text-sm font-semibold text-foreground">{t("access.policies.detail.statements")}</h3>
        <ul className="space-y-2">
          {statements.map((s) => (
            <li key={s.key} className="rounded-sm border border-border p-3">
              <p className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
                {t(s.effect === "Allow" ? "access.policies.detail.allow" : "access.policies.detail.deny")}
                {s.hasCondition && <span className="ml-2 normal-case text-muted-foreground">{t("access.policies.detail.conditional")}</span>}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{s.actions.join(", ")}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{s.resources.join(", ")}</p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label={t("access.policies.detail.document")} className="space-y-2">
        <h3 className="font-display text-sm font-semibold text-foreground">{t("access.policies.detail.document")}</h3>
        <pre tabIndex={0} className="max-h-80 overflow-auto rounded-sm border border-border bg-muted p-3 font-mono text-xs text-foreground">
          {formatPolicy(policy.document)}
        </pre>
      </section>
    </section>
  );
}
