"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormField, Label, SentryInput, Switch } from "@repo/ui";
import { FormDialog } from "@/features/applications/components/FormDialog";
import { describeError } from "@/lib/api-error";
import { useCopy } from "@/i18n";
import { useLdapMutations } from "../api/connections";
import { EMPTY_LDAP_DRAFT, toLdapBody, validateLdapDraft, withTls, type LdapDraft } from "../model/ldap";

export interface CreateLdapDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TextField = Exclude<keyof LdapDraft, "useTls">;

const FIELD_ERROR_KEYS = {
  name: "tenantIntegrations.common.requiredField",
  host: "tenantIntegrations.ldap.form.hostRequired",
  port: "tenantIntegrations.ldap.form.portInvalid",
  bindDn: "tenantIntegrations.ldap.form.bindDnRequired",
  bindPassword: "tenantIntegrations.ldap.form.passwordRequired",
  baseDn: "tenantIntegrations.ldap.form.baseDnRequired",
} as const;

export function CreateLdapDialog({ slug, open, onOpenChange }: CreateLdapDialogProps) {
  const { t } = useCopy();
  const { create } = useLdapMutations(slug);
  const [draft, setDraft] = useState<LdapDraft>(EMPTY_LDAP_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();

  useEffect(() => {
    if (!open) {
      setDraft(EMPTY_LDAP_DRAFT);
      setSubmitted(false);
      setServerError(undefined);
    }
  }, [open]);

  const errors = submitted ? validateLdapDraft(draft) : [];
  const f = "tenantIntegrations.ldap.form" as const;
  const message = (field: keyof typeof FIELD_ERROR_KEYS) =>
    errors.includes(field) ? t(FIELD_ERROR_KEYS[field]) : undefined;
  const set = (key: TextField) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value });

  const onSubmit = async () => {
    setSubmitted(true);
    if (validateLdapDraft(draft).length > 0) return;
    setServerError(undefined);
    try {
      await create.mutateAsync(toLdapBody(draft));
      toast.success(t(`${f}.saved`));
      onOpenChange(false);
    } catch (error: unknown) {
      setServerError(describeError(error).message);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(`${f}.title`)}
      description={t(`${f}.description`)}
      submitLabel={t(`${f}.submit`)}
      onSubmit={onSubmit}
      pending={create.isPending}
      error={serverError}
    >
      <FormField label={t(`${f}.name`)} required error={message("name")}>
        {(c) => <SentryInput {...c} value={draft.name} onChange={set("name")} />}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField label={t(`${f}.host`)} required error={message("host")}>
          {(c) => <SentryInput {...c} value={draft.host} spellCheck={false} onChange={set("host")} />}
        </FormField>
        <FormField label={t(`${f}.port`)} required error={message("port")}>
          {(c) => <SentryInput {...c} inputMode="numeric" value={draft.port} onChange={set("port")} />}
        </FormField>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="ldap-tls" checked={draft.useTls} onCheckedChange={(useTls) => setDraft(withTls(draft, useTls))} />
        <Label htmlFor="ldap-tls">{t(`${f}.useTls`)}</Label>
      </div>
      <FormField label={t(`${f}.bindDn`)} required error={message("bindDn")}>
        {(c) => <SentryInput {...c} value={draft.bindDn} spellCheck={false} autoComplete="off" onChange={set("bindDn")} />}
      </FormField>
      <FormField label={t(`${f}.bindPassword`)} required error={message("bindPassword")}>
        {(c) => <SentryInput {...c} type="password" autoComplete="new-password" value={draft.bindPassword} onChange={set("bindPassword")} />}
      </FormField>
      <FormField label={t(`${f}.baseDn`)} required error={message("baseDn")}>
        {(c) => <SentryInput {...c} value={draft.baseDn} spellCheck={false} onChange={set("baseDn")} />}
      </FormField>
      <details className="space-y-4 rounded-sm border border-border p-3">
        <summary className="cursor-pointer font-display text-sm font-medium">{t(`${f}.advanced`)}</summary>
        <div className="mt-3 space-y-4">
          <FormField
            label={t(`${f}.userFilter`)}
            optionalLabel={t("common.labels.optional")}
            error={errors.includes("controlChars") ? t(`${f}.controlChars`) : undefined}
          >
            {(c) => <SentryInput {...c} className="font-mono" value={draft.userFilter} spellCheck={false} onChange={set("userFilter")} />}
          </FormField>
          <FormField label={t(`${f}.groupFilter`)} optionalLabel={t("common.labels.optional")}>
            {(c) => <SentryInput {...c} className="font-mono" value={draft.groupFilter} spellCheck={false} onChange={set("groupFilter")} />}
          </FormField>
          <FormField label={t(`${f}.emailAttribute`)} optionalLabel={t("common.labels.optional")}>
            {(c) => <SentryInput {...c} value={draft.emailAttribute} spellCheck={false} onChange={set("emailAttribute")} />}
          </FormField>
          <FormField label={t(`${f}.syncSchedule`)} optionalLabel={t("common.labels.optional")}>
            {(c) => <SentryInput {...c} className="font-mono" value={draft.syncSchedule} spellCheck={false} onChange={set("syncSchedule")} />}
          </FormField>
        </div>
      </details>
    </FormDialog>
  );
}
