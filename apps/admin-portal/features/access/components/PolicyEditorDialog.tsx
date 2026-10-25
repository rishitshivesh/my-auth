"use client";

import { useEffect, useMemo, useState } from "react";
import { useCopy } from "@/i18n";
import { hasExplicitDeny, type PolicyIssue } from "../model/policy-document";
import { evaluatePolicyForm, initialPolicyForm, type PolicyFormValues } from "../model/policy-form";
import type { PolicyDto } from "../model/types";
import { FormDialog } from "./FormDialog";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";

export interface PolicyEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: PolicyDto;
  pending: boolean;
  error?: string;
  onSubmit: (values: PolicyFormValues) => void;
}

export function PolicyEditorDialog({ open, onOpenChange, policy, pending, error, onSubmit }: PolicyEditorDialogProps) {
  const { t } = useCopy();
  const mode = policy ? "edit" : "create";
  const [values, setValues] = useState<PolicyFormValues>(() => initialPolicyForm(policy));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(initialPolicyForm(policy));
    setTouched(false);
  }, [open, policy]);

  const state = useMemo(() => evaluatePolicyForm(values, mode), [values, mode]);
  const issues: readonly PolicyIssue[] = state.parsed.ok ? [] : state.parsed.issues;
  const denies = state.parsed.ok && hasExplicitDeny(state.parsed.document);
  const set = (key: keyof PolicyFormValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t(mode === "create" ? "access.policies.editor.createTitle" : "access.policies.editor.editTitle")}
      description={t("access.policies.editor.description")}
      submitLabel={t(mode === "create" ? "access.policies.editor.create" : "access.policies.editor.save")}
      cancelLabel={t("common.actions.cancel")}
      pending={pending}
      error={error}
      onSubmit={() => {
        setTouched(true);
        if (state.canSubmit) onSubmit(values);
      }}
    >
      {mode === "create" && (
        <TextField
          label={t("access.policies.editor.name")}
          value={values.name}
          onChange={set("name")}
          required
          autoComplete="off"
          error={touched && state.nameError ? t(`access.policies.editor.errors.${state.nameError}`) : undefined}
        />
      )}
      <TextAreaField
        label={t("access.policies.editor.descriptionLabel")}
        value={values.description}
        onChange={set("description")}
        rows={2}
        optionalLabel={t("common.labels.optional")}
      />
      {mode === "create" && (
        <fieldset className="space-y-2">
          <legend className="font-display text-[13px] font-medium text-foreground">{t("access.policies.editor.type")}</legend>
          {(["inline", "managed"] as const).map((type) => (
            <label key={type} className="flex items-start gap-2 font-body text-sm text-foreground">
              <input
                type="radio"
                name="policy-type"
                className="mt-1 accent-[var(--color-accent)]"
                checked={values.type === type}
                onChange={() => setValues((v) => ({ ...v, type }))}
              />
              <span>
                {t(`access.policies.editor.types.${type}`)}
                <span className="block text-xs text-muted-foreground">{t(`access.policies.editor.typeHints.${type}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <TextAreaField
        label={t("access.policies.editor.json")}
        hint={t("access.policies.editor.jsonHint")}
        value={values.json}
        onChange={set("json")}
        rows={14}
        mono
        required
        error={touched && issues.length > 0 ? t("access.policies.editor.fixIssues", { count: issues.length }) : undefined}
      />
      {issues.length > 0 && (
        <ul aria-label={t("access.policies.editor.issuesLabel")} className="space-y-1 font-body text-sm text-destructive">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.statement ?? "doc"}-${index}`} className="break-words">
              {issue.statement === undefined
                ? t(`access.policies.issues.${issue.code}`)
                : t("access.policies.issues.inStatement", { number: issue.statement + 1, message: t(`access.policies.issues.${issue.code}`) })}
            </li>
          ))}
        </ul>
      )}
      {denies && <p role="note" className="rounded-sm border border-border bg-muted p-3 font-body text-sm text-foreground">{t("access.policies.denyNote")}</p>}
    </FormDialog>
  );
}
