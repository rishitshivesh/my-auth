"use client";

import { SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { GroupDetailDto } from "../model/types";

export interface GroupMemberRow {
  userId: string;
  /** Resolved display text; falls back to the id when the person is not in the loaded directory. */
  label: string;
  resolved: boolean;
}

export interface GroupDetailPanelProps {
  detail: GroupDetailDto;
  members: readonly GroupMemberRow[];
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddMembers: () => void;
  onRemoveMember: (member: GroupMemberRow) => void;
  onAttachPolicy: () => void;
  onDetachPolicy: (policyId: string, name: string) => void;
}

export function GroupDetailPanel({
  detail, members, canWrite, onEdit, onDelete, onAddMembers, onRemoveMember, onAttachPolicy, onDetachPolicy,
}: GroupDetailPanelProps) {
  const { t } = useCopy();
  const { group, policies } = detail;
  const editable = canWrite && !group.isSystem;
  return (
    <section aria-labelledby="group-detail-title" className="space-y-6 rounded-md border border-border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="group-detail-title" className="break-words font-display text-lg font-semibold text-foreground">{group.name}</h2>
          <p className="break-all font-mono text-xs text-muted-foreground">{group.path}</p>
          {group.description && <p className="break-words font-body text-sm text-muted-foreground">{group.description}</p>}
        </div>
        {editable && (
          <div className="flex gap-2">
            <SentryButton variant="outline" size="sm" onClick={onEdit}>{t("access.roles.detail.edit")}</SentryButton>
            <SentryButton variant="destructive" size="sm" onClick={onDelete}>{t("access.roles.detail.delete")}</SentryButton>
          </div>
        )}
      </header>
      {group.isSystem && <p role="note" className="font-body text-sm text-muted-foreground">{t("access.groups.detail.protected")}</p>}

      <section aria-labelledby="group-members-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="group-members-title" className="font-display text-sm font-semibold text-foreground">
            {t("access.groups.detail.members", { count: members.length })}
          </h3>
          {canWrite && <SentryButton variant="outline" size="sm" onClick={onAddMembers}>{t("access.groups.detail.addMembers")}</SentryButton>}
        </div>
        {members.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">{t("access.groups.detail.noMembers")}</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-sm border border-border">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between gap-3 p-2.5">
                <span className={member.resolved ? "min-w-0 break-all font-body text-sm text-foreground" : "min-w-0 break-all font-mono text-xs text-foreground"}>
                  {member.label}
                </span>
                {canWrite && (
                  <SentryButton variant="ghost" size="sm" aria-label={t("access.groups.detail.removeMember", { name: member.label })} onClick={() => onRemoveMember(member)}>
                    {t("access.roles.detail.remove")}
                  </SentryButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="group-policies-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="group-policies-title" className="font-display text-sm font-semibold text-foreground">{t("access.roles.detail.policies")}</h3>
          {canWrite && <SentryButton variant="outline" size="sm" onClick={onAttachPolicy}>{t("access.roles.detail.attachPolicy")}</SentryButton>}
        </div>
        {policies.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">{t("access.roles.detail.noPolicies")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-sm border border-border">
            {policies.map((link) => {
              const name = link.policy?.name ?? link.policyId;
              return (
                <li key={link.id} className="flex items-center justify-between gap-3 p-2.5">
                  <span className="min-w-0 break-words font-body text-sm text-foreground">{name}</span>
                  {canWrite && (
                    <SentryButton variant="ghost" size="sm" aria-label={t("access.roles.detail.detachPolicy", { name })} onClick={() => onDetachPolicy(link.policyId, name)}>
                      {t("access.roles.detail.detach")}
                    </SentryButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
