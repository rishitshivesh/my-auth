"use client";

import { FormField, SentryButton } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { SimulationFieldError, SimulationFormErrors, SimulationFormValues } from "../model/simulation";
import { TextField } from "./TextField";

export interface PrincipalOption {
  id: string;
  label: string;
}

export interface SimulationFormProps {
  values: SimulationFormValues;
  onChange: (values: SimulationFormValues) => void;
  errors: SimulationFormErrors;
  principals: readonly PrincipalOption[];
  principalSearch: string;
  onPrincipalSearch: (value: string) => void;
  principalsLoading: boolean;
  pending: boolean;
  onSubmit: () => void;
  serverError?: string;
}

export function SimulationForm({
  values, onChange, errors, principals, principalSearch, onPrincipalSearch, principalsLoading, pending, onSubmit, serverError,
}: SimulationFormProps) {
  const { t } = useCopy();
  const err = (code?: SimulationFieldError) => (code ? t(`access.simulator.errors.${code}`) : undefined);
  const set = <K extends keyof SimulationFormValues>(key: K) => (value: SimulationFormValues[K]) => onChange({ ...values, [key]: value });
  return (
    <form
      onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
      noValidate
      className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-6"
      aria-label={t("access.simulator.formLabel")}
    >
      <TextField label={t("access.simulator.searchPrincipal")} type="search" value={principalSearch} onChange={onPrincipalSearch} autoComplete="off" />
      <FormField label={t("access.simulator.principal")} hint={principalsLoading ? t("states.loading.title") : t("access.simulator.principalHint")} error={err(errors.userId)} required>
        {(control) => (
          <select
            {...control}
            value={values.userId}
            onChange={(event) => set("userId")(event.target.value)}
            className="h-[42px] w-full min-w-0 rounded-sm border border-border bg-muted px-3 font-body text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
          >
            <option value="">{t("access.simulator.choosePrincipal")}</option>
            {principals.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        )}
      </FormField>
      <TextField label={t("access.simulator.action")} hint={t("access.simulator.actionHint")} value={values.action} onChange={set("action")} error={err(errors.action)} required mono autoComplete="off" />
      <TextField label={t("access.simulator.resource")} hint={t("access.simulator.resourceHint")} value={values.resource} onChange={set("resource")} error={err(errors.resource)} required mono autoComplete="off" />
      <fieldset className="space-y-4 border-t border-border pt-4">
        <legend className="font-display text-sm font-semibold text-foreground">{t("access.simulator.context")}</legend>
        <TextField label={t("access.simulator.ip")} hint={t("access.simulator.ipHint")} value={values.ipAddress} onChange={set("ipAddress")} error={err(errors.ipAddress)} optionalLabel={t("common.labels.optional")} mono autoComplete="off" />
        <label className="flex items-center gap-2 font-body text-sm text-foreground">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={values.mfaVerified} onChange={(e) => set("mfaVerified")(e.target.checked)} />
          {t("access.simulator.mfa")}
        </label>
      </fieldset>
      {serverError && <p role="alert" className="break-words font-body text-sm text-destructive">{serverError}</p>}
      <SentryButton type="submit" variant="primary" isLoading={pending}>{t("access.simulator.run")}</SentryButton>
    </form>
  );
}
