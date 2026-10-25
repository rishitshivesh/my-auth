"use client";

import { useEffect, useMemo, useState } from "react";
import { Checkbox, FormField, Label, RadioGroup, RadioGroupItem, SentryInput, Textarea } from "@repo/ui";
import { describeError } from "@/lib/api-error";
import { useCopy } from "@/i18n";
import {
  EMPTY_CREATE_DRAFT, allowedGrants, toCreateBody, toggleGrant, validateCreateDraft, withClientType,
  type CreateClientDraft,
} from "../model/client-form";
import type { ClientType, CreatedOAuthClient, GrantType } from "../model/types";
import { useCreateClient } from "../api/clients";
import { createFieldMessages } from "./client-form-errors";
import { FormDialog } from "./FormDialog";

export interface CreateApplicationDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (client: CreatedOAuthClient) => void;
}

const GRANT_LABEL_KEYS = {
  authorization_code: "tenantIntegrations.apps.create.grantAuthorizationCode",
  refresh_token: "tenantIntegrations.apps.create.grantRefreshToken",
  client_credentials: "tenantIntegrations.apps.create.grantClientCredentials",
} as const;

export function CreateApplicationDialog({ slug, open, onOpenChange, onCreated }: CreateApplicationDialogProps) {
  const { t, tk } = useCopy();
  const create = useCreateClient(slug);
  const [draft, setDraft] = useState<CreateClientDraft>(EMPTY_CREATE_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();

  useEffect(() => {
    if (!open) {
      setDraft(EMPTY_CREATE_DRAFT);
      setSubmitted(false);
      setServerError(undefined);
    }
  }, [open]);

  const messages = useMemo(() => createFieldMessages(submitted ? validateCreateDraft(draft) : []), [draft, submitted]);

  const onSubmit = async () => {
    setSubmitted(true);
    if (validateCreateDraft(draft).length > 0) return;
    setServerError(undefined);
    try {
      onCreated(await create.mutateAsync(toCreateBody(draft)));
      create.reset();
      onOpenChange(false);
    } catch (error: unknown) {
      setServerError(describeError(error).message);
    }
  };

  const grants = allowedGrants(draft.clientType);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("tenantIntegrations.apps.create.title")}
      description={t("tenantIntegrations.apps.create.description")}
      submitLabel={t("tenantIntegrations.apps.create.submit")}
      onSubmit={onSubmit}
      pending={create.isPending}
      error={serverError}
    >
      <FormField label={t("tenantIntegrations.apps.create.name")} required error={messages.name}>
        {(control) => (
          <SentryInput {...control} value={draft.name} autoComplete="off" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        )}
      </FormField>
      <FormField label={t("tenantIntegrations.apps.create.description2")} optionalLabel={t("common.labels.optional")}>
        {(control) => (
          <SentryInput {...control} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        )}
      </FormField>
      <fieldset className="space-y-2">
        <legend className="font-display text-[13px] font-medium text-foreground">{t("tenantIntegrations.apps.create.type")}</legend>
        <RadioGroup
          value={draft.clientType}
          onValueChange={(value) => setDraft(withClientType(draft, value as ClientType))}
          className="gap-3"
        >
          {(["confidential", "public"] as const).map((type) => (
            <div key={type} className="flex items-start gap-2">
              <RadioGroupItem value={type} id={`client-type-${type}`} className="mt-1" />
              <Label htmlFor={`client-type-${type}`} className="flex flex-col items-start gap-0.5">
                <span>{t(type === "public" ? "tenantIntegrations.apps.typePublic" : "tenantIntegrations.apps.typeConfidential")}</span>
                <span className="font-body text-xs font-normal text-muted-foreground">
                  {t(type === "public" ? "tenantIntegrations.apps.create.typePublicHint" : "tenantIntegrations.apps.create.typeConfidentialHint")}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        {draft.clientType === "public" && (
          <p className="font-body text-xs text-muted-foreground">{t("tenantIntegrations.apps.create.pkceNote")}</p>
        )}
      </fieldset>
      <fieldset className="space-y-2" aria-describedby={messages.grantTypes ? "grant-error" : undefined}>
        <legend className="font-display text-[13px] font-medium text-foreground">{t("tenantIntegrations.apps.create.grants")}</legend>
        {grants.map((grant: GrantType) => (
          <div key={grant} className="flex items-center gap-2">
            <Checkbox
              id={`grant-${grant}`}
              checked={draft.grantTypes.includes(grant)}
              onCheckedChange={() => setDraft(toggleGrant(draft, grant))}
            />
            <Label htmlFor={`grant-${grant}`}>{tk(GRANT_LABEL_KEYS[grant])}</Label>
          </div>
        ))}
        {messages.grantTypes && <p id="grant-error" role="alert" className="font-body text-xs text-destructive">{messages.grantTypes}</p>}
      </fieldset>
      <FormField label={t("tenantIntegrations.apps.create.redirects")} hint={t("tenantIntegrations.apps.create.redirectsHint")} error={messages.redirectUris}>
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            className="font-mono text-sm"
            spellCheck={false}
            value={draft.redirectUris}
            onChange={(e) => setDraft({ ...draft, redirectUris: e.target.value })}
          />
        )}
      </FormField>
    </FormDialog>
  );
}
