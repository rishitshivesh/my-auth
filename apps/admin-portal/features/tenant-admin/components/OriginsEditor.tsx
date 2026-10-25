"use client";

import { useState } from "react";
import { FormField, SentryButton, SentryInput, SettingsSection } from "@repo/ui";
import { useCopy } from "@/i18n";
import { MAX_ORIGINS, addOrigin, removeOrigin, sameOrigins, type OriginError } from "../model/origins";

export interface OriginsEditorProps {
  saved: readonly string[];
  draft: readonly string[];
  readOnly: boolean;
  pending: boolean;
  error?: string;
  savedMessage?: string;
  onChange: (next: string[]) => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function OriginsEditor({ saved, draft, readOnly, pending, error, savedMessage, onChange, onSave, onDiscard }: OriginsEditorProps) {
  const { t } = useCopy();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<OriginError | null>(null);

  const add = () => {
    const result = addOrigin(draft, value);
    if ("error" in result) {
      setProblem(result.error);
      return;
    }
    setProblem(null);
    setValue("");
    onChange(result.origins);
  };

  return (
    <SettingsSection
      title={t("tenantAdmin.security.origins.title")}
      description={t("tenantAdmin.security.origins.description")}
      dirty={!sameOrigins(saved, draft)}
      pending={pending}
      error={error}
      savedMessage={savedMessage}
      readOnly={readOnly}
      onSave={onSave}
      onDiscard={() => { setProblem(null); setValue(""); onDiscard(); }}
      saveLabel={t("tenantAdmin.security.origins.save")}
      discardLabel={t("tenantAdmin.security.origins.discard")}
    >
      {!readOnly && (
        <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex flex-wrap items-start gap-3">
          <div className="min-w-[220px] flex-1">
            <FormField
              label={t("tenantAdmin.security.origins.label")}
              hint={t("tenantAdmin.security.origins.hint")}
              error={problem ? t(`tenantAdmin.security.origins.errors.${problem}`) : undefined}
            >
              {(control) => (
                <SentryInput {...control} value={value} spellCheck={false} autoComplete="off" className="font-mono" onChange={(e) => setValue(e.target.value)} />
              )}
            </FormField>
          </div>
          <SentryButton type="submit" variant="outline" className="mt-[26px]">{t("tenantAdmin.security.origins.add")}</SentryButton>
        </form>
      )}
      <p className="font-body text-xs text-muted-foreground">{t("tenantAdmin.security.origins.count", { count: draft.length, max: MAX_ORIGINS })}</p>
      {draft.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground">{t("tenantAdmin.security.origins.empty")}</p>
      ) : (
        <ul aria-label={t("tenantAdmin.security.origins.list")} className="divide-y divide-border rounded-sm border border-border">
          {draft.map((origin) => (
            <li key={origin} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="break-all font-mono text-sm text-foreground">{origin}</span>
              {!readOnly && (
                <SentryButton size="sm" variant="ghost" onClick={() => onChange(removeOrigin(draft, origin))}>
                  {t("tenantAdmin.security.origins.remove", { origin })}
                </SentryButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
