"use client";

import { useEffect, useMemo, useState } from "react";
import { SentryButton, StepFlow } from "@repo/ui";
import { useCopy } from "@/i18n";
import { ChangeList } from "@/features/access/components/ChangeList";
import { CheckList } from "@/features/access/components/CheckList";
import { FormDialog } from "@/features/access/components/FormDialog";
import { TextAreaField } from "@/features/access/components/TextAreaField";
import { permissionNamesOf, roleLabel } from "@/features/access/model/role-diff";
import type { RoleDto } from "@/features/access/model/types";
import { DEFAULT_INVITE_DAYS, INVITE_DAY_OPTIONS, MAX_INVITES_PER_BATCH, parseEmails, summarizeBatch, type BatchOutcome } from "../model/invites";

type Step = "details" | "review" | "done";

export interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: readonly RoleDto[];
  rolesLoading: boolean;
  pending: boolean;
  error?: string;
  outcomes: readonly BatchOutcome[] | null;
  onSend: (input: { emails: readonly string[]; roleIds: string[]; expiresInDays: number }) => void;
}

/** Details -> access review -> confirmation (sent) with the resulting effective access. No passwords are ever collected. */
export function InviteDialog({ open, onOpenChange, roles, rolesLoading, pending, error, outcomes, onSend }: InviteDialogProps) {
  const { t, tk } = useCopy();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [days, setDays] = useState<number>(DEFAULT_INVITE_DAYS);
  const [step, setStep] = useState<Step>("details");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText(""); setPicked(new Set()); setDays(DEFAULT_INVITE_DAYS); setStep("details"); setTouched(false);
  }, [open]);
  useEffect(() => { if (outcomes) setStep("done"); }, [outcomes]);

  const parsed = useMemo(() => parseEmails(text), [text]);
  const chosen = useMemo(() => roles.filter((r) => picked.has(r.id)), [roles, picked]);
  const emailProblem = parsed.valid.length === 0 ? "none" : parsed.invalid.length > 0 ? "invalid" : parsed.overLimit ? "limit" : undefined;
  const summary = outcomes ? summarizeBatch(outcomes) : null;
  const steps = [
    { id: "details", label: t("users.invite.steps.details") },
    { id: "review", label: t("users.invite.steps.review") },
    { id: "done", label: t("users.invite.steps.done") },
  ];
  const toggle = (id: string) => setPicked((c) => { const n = new Set(c); if (!n.delete(id)) n.add(id); return n; });

  const next = () => {
    if (step === "details") {
      setTouched(true);
      if (!emailProblem) setStep("review");
    } else if (step === "review") {
      onSend({ emails: parsed.valid, roleIds: [...picked], expiresInDays: days });
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t("users.invite.title")}
      description={t("users.invite.description")}
      submitLabel={step === "details" ? t("common.actions.continue") : t("users.invite.send", { count: parsed.valid.length })}
      cancelLabel={t(step === "done" ? "common.actions.close" : "common.actions.cancel")}
      hideSubmit={step === "done"}
      pending={pending}
      error={step === "done" ? undefined : error}
      onSubmit={next}
    >
      <StepFlow
        steps={steps}
        currentId={step}
        progressLabel={t("users.invite.progress", { current: steps.findIndex((s) => s.id === step) + 1, total: steps.length })}
        stepLabel={(s, i) => t("users.invite.stepLabel", { number: i + 1, label: s.label })}
      >
        {step === "details" && (
          <div className="space-y-4">
            <TextAreaField
              label={t("users.invite.emails")}
              hint={t("users.invite.emailsHint", { max: MAX_INVITES_PER_BATCH })}
              value={text}
              onChange={setText}
              rows={4}
              required
              error={touched && emailProblem ? tk(`users.invite.errors.${emailProblem}`, { max: MAX_INVITES_PER_BATCH, list: parsed.invalid.join(", ") }) : undefined}
            />
            <CheckList
              legend={t("users.invite.roles")}
              items={roles.map((r) => ({ id: r.id, label: roleLabel(r), description: r.description ?? undefined, badge: r.isSystem ? t("access.roles.badges.system") : undefined }))}
              selected={picked}
              onToggle={toggle}
              emptyText={t(rolesLoading ? "states.loading.title" : "users.invite.noRoles")}
            />
            <label className="block space-y-1.5 font-display text-[13px] font-medium text-foreground">
              {t("users.invite.expiry")}
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="mt-1.5 h-[42px] w-full rounded-sm border border-border bg-muted px-3 font-body text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {INVITE_DAY_OPTIONS.map((d) => <option key={d} value={d}>{t("users.invite.expiryOption", { days: d })}</option>)}
              </select>
            </label>
            <p className="font-body text-xs text-muted-foreground">{t("users.invite.passwordNote")}</p>
          </div>
        )}
        {step === "review" && (
          <div className="space-y-4">
            <ChangeList label={t("users.invite.review.people", { count: parsed.valid.length })} names={parsed.valid} marker="+" emptyText="" />
            <ChangeList label={t("users.invite.review.roles")} names={chosen.map(roleLabel)} marker="+" emptyText={t("users.invite.review.noRoles")} />
            <ChangeList label={t("users.invite.review.access")} names={permissionNamesOf(chosen)} marker="+" emptyText={t("users.invite.review.noAccess")} />
            <p className="font-body text-sm text-muted-foreground">{t("users.invite.review.effect", { days })}</p>
            <SentryButton type="button" variant="outline" size="sm" onClick={() => setStep("details")}>{t("common.actions.back")}</SentryButton>
          </div>
        )}
        {step === "done" && summary && (
          <div className="space-y-4" role="status" aria-live="polite">
            <p className="font-body text-sm text-foreground">{t("users.invite.done.sent", { count: summary.sent })}</p>
            {summary.failed.length > 0 && (
              <div role="alert" className="space-y-1">
                <p className="font-body text-sm text-destructive">{t("users.invite.done.failed", { count: summary.failed.length })}</p>
                <ul className="space-y-1">
                  {summary.failed.map((f) => (
                    <li key={f.email} className="break-all font-mono text-xs text-foreground">{f.email}{f.error ? ` — ${f.error}` : ""}</li>
                  ))}
                </ul>
              </div>
            )}
            <ChangeList label={t("users.invite.done.effective")} names={permissionNamesOf(chosen)} marker="+" emptyText={t("users.invite.review.noAccess")} />
          </div>
        )}
      </StepFlow>
    </FormDialog>
  );
}
