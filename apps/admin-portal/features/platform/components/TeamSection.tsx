"use client";

import { useState } from "react";
import { ConfirmDialog, FormField, GlassCard, ResourceTable, SentryButton, SentryInput } from "@repo/ui";
import { useCopy } from "@/i18n";
import { SentryApiError } from "@scrolloop/sdk";
import { errorText, statusFromQuery } from "@/lib/resource-status";
import { formatDate } from "@/lib/format";
import { useAddTeamMember, useRemoveTeamMember, useTeam } from "../api/admin";
import { isValidEmail } from "../model/team";
import type { TeamMember } from "../model/types";

const NOT_FOUND = 404;
const CONFLICT = 409;

export function TeamSection() {
  const { t } = useCopy();
  const team = useTeam();
  const add = useAddTeamMember();
  const remove = useRemoveTeamMember();
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [target, setTarget] = useState<TeamMember | null>(null);
  const [added, setAdded] = useState("");

  const addError = (() => {
    if (invalid) return t("platform.team.add.invalid");
    if (!(add.error instanceof SentryApiError)) return errorText(add.error);
    if (add.error.status === NOT_FOUND || add.error.status === 400) return t("platform.team.add.notFound");
    if (add.error.status === CONFLICT) return t("platform.team.add.duplicate");
    return errorText(add.error);
  })();

  const submit = () => {
    if (!isValidEmail(email)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const value = email.trim();
    add.mutate(value, { onSuccess: () => { setAdded(value); setEmail(""); } });
  };
  const retry = { label: t("platform.common.retry"), onClick: () => { void team.refetch(); } };

  return (
    <GlassCard tier={1} className="space-y-4 p-6">
      <header className="space-y-1">
        <h2 className="font-display text-base font-semibold text-foreground">{t("platform.team.title")}</h2>
        <p className="font-body text-sm text-muted-foreground">{t("platform.team.description")}</p>
      </header>
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-wrap items-start gap-3">
        <div className="min-w-[220px] flex-1">
          <FormField label={t("platform.team.add.label")} hint={t("platform.team.add.hint")} error={addError}>
            {(c) => <SentryInput {...c} type="email" autoComplete="off" value={email} onChange={(e) => { setEmail(e.target.value); setInvalid(false); add.reset(); }} />}
          </FormField>
        </div>
        <SentryButton type="submit" className="mt-[26px]" isLoading={add.isPending}>
          {add.isPending ? t("platform.team.add.adding") : t("platform.team.add.action")}
        </SentryButton>
      </form>
      <p role="status" className="font-body text-sm text-success-text">{add.isSuccess && added ? t("platform.team.add.added", { email: added }) : ""}</p>
      <ResourceTable<TeamMember>
        columns={[
          { header: t("platform.team.columns.name"), accessorKey: (m) => [m.firstName, m.lastName].filter(Boolean).join(" ") || t("platform.team.unnamed") },
          { header: t("platform.team.columns.email"), accessorKey: "email" },
          { header: t("platform.team.columns.added"), accessorKey: (m) => formatDate(m.addedAt) },
        ]}
        rows={team.data ?? []}
        status={statusFromQuery(team)}
        rowActions={(m) => [{ id: "remove", label: t("platform.team.remove.action", { email: m.email }), destructive: true, onSelect: () => setTarget(m) }]}
        labels={{
          searchLabel: "", searchPlaceholder: "", previous: "", next: "", pageStatus: "",
          rowActions: (m) => t("platform.tenants.rowActions", { name: m.email }),
          loading: { title: t("states.loading.title") },
          empty: { title: t("platform.team.emptyTitle"), description: t("platform.team.emptyBody") },
          filteredEmpty: { title: t("states.filteredEmpty.title") },
          error: { title: t("platform.common.errorTitle"), description: t("platform.common.errorBody"), retry },
          denied: { title: t("platform.common.deniedTitle"), description: t("platform.common.deniedBody") },
          unavailable: { title: t("platform.common.unavailableTitle"), description: t("platform.common.unavailableBody"), retry },
        }}
      />
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => { if (!open) { setTarget(null); remove.reset(); } }}
        title={t("platform.team.remove.title", { email: target?.email ?? "" })}
        description={t("platform.team.remove.description")}
        effects={[t("platform.team.remove.effects.one"), t("platform.team.remove.effects.two")]}
        effectsHeading={t("platform.tenantDetail.dialog.effects")}
        confirmLabel={t("platform.team.remove.confirm")}
        cancelLabel={t("platform.tenantDetail.dialog.cancel")}
        destructive
        pending={remove.isPending}
        error={errorText(remove.error)}
        onConfirm={async () => { if (target) await remove.mutateAsync(target.id).then(() => setTarget(null)).catch(() => undefined); }}
      />
    </GlassCard>
  );
}
