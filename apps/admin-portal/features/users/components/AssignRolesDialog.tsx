"use client";

import { useEffect, useMemo, useState } from "react";
import { SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import { ChangeList } from "@/features/access/components/ChangeList";
import { CheckList } from "@/features/access/components/CheckList";
import { FormDialog } from "@/features/access/components/FormDialog";
import { TextAreaField } from "@/features/access/components/TextAreaField";
import { TextField } from "@/features/access/components/TextField";
import { accessImpact, roleLabel } from "@/features/access/model/role-diff";
import type { RoleDto } from "@/features/access/model/types";

type Step = "select" | "review" | "done";

export interface AssignRolesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  assigned: readonly RoleDto[];
  allRoles: readonly RoleDto[];
  pending: boolean;
  error?: string;
  succeeded: boolean;
  onConfirm: (input: { roleNames: string[]; reason?: string; expiresAt?: string }) => void;
  onViewEffective: () => void;
}

/** Role selection -> access review (permissions gained) -> confirmation -> link to effective access. */
export function AssignRolesDialog({ open, onOpenChange, personName, assigned, allRoles, pending, error, succeeded, onConfirm, onViewEffective }: AssignRolesDialogProps) {
  const { t } = useCopy();
  const [step, setStep] = useState<Step>("select");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");

  useEffect(() => { if (open) { setStep("select"); setPicked(new Set()); setReason(""); setExpires(""); } }, [open]);
  useEffect(() => { if (succeeded) setStep("done"); }, [succeeded]);

  const held = useMemo(() => new Set(assigned.map((r) => r.name)), [assigned]);
  const candidates = allRoles.filter((r) => !held.has(r.name) && r.isActive);
  const chosen = candidates.filter((r) => picked.has(r.id));
  const impact = accessImpact(assigned, [...assigned, ...chosen]);
  const toggle = (id: string) => setPicked((c) => { const n = new Set(c); if (!n.delete(id)) n.add(id); return n; });

  const submit = () => {
    if (step === "select") setStep("review");
    else if (step === "review") onConfirm({ roleNames: chosen.map((r) => r.name), reason: reason.trim() || undefined, expiresAt: expires ? new Date(expires).toISOString() : undefined });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t("users.roles.assign.title", { name: personName })}
      description={t("users.roles.assign.description")}
      submitLabel={t(step === "select" ? "common.actions.continue" : "users.roles.assign.confirm")}
      cancelLabel={t(step === "done" ? "common.actions.close" : "common.actions.cancel")}
      hideSubmit={step === "done"}
      submitDisabled={step === "select" && chosen.length === 0}
      pending={pending}
      error={step === "done" ? undefined : error}
      onSubmit={submit}
    >
      {step === "select" && (
        <div className="space-y-4">
          <CheckList
            legend={t("users.roles.assign.legend")}
            items={candidates.map((r) => ({ id: r.id, label: roleLabel(r), description: r.description ?? undefined }))}
            selected={picked}
            onToggle={toggle}
            emptyText={t("users.roles.assign.empty")}
          />
          <TextAreaField label={t("users.roles.assign.reason")} value={reason} onChange={setReason} rows={2} optionalLabel={t("common.labels.optional")} />
          <TextField label={t("users.roles.assign.expires")} hint={t("users.roles.assign.expiresHint")} type="datetime-local" value={expires} onChange={setExpires} optionalLabel={t("common.labels.optional")} />
        </div>
      )}
      {step === "review" && (
        <div className="space-y-4">
          <ChangeList label={t("users.roles.assign.reviewRoles")} names={chosen.map(roleLabel)} marker="+" emptyText="" />
          <ChangeList label={t("users.roles.assign.reviewGained")} names={impact.gained} marker="+" emptyText={t("users.roles.assign.noNewAccess")} />
          <p className="font-body text-sm text-muted-foreground">
            {expires ? t("users.roles.assign.reviewExpiry", { date: new Date(expires).toLocaleString() }) : t("users.roles.assign.reviewNoExpiry")}
          </p>
          <SentryButton type="button" variant="outline" size="sm" onClick={() => setStep("select")}>{t("common.actions.back")}</SentryButton>
        </div>
      )}
      {step === "done" && (
        <div role="status" aria-live="polite" className="space-y-3">
          <p className="font-body text-sm text-foreground">{t("users.roles.assign.done", { name: personName })}</p>
          <SentryButton type="button" variant="outline" onClick={() => { onViewEffective(); onOpenChange(false); }}>{t("users.roles.assign.viewEffective")}</SentryButton>
        </div>
      )}
    </FormDialog>
  );
}
