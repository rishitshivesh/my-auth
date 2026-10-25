"use client";

import { useEffect, useState } from "react";
import { Checkbox, FormField, Label, SentryInput } from "@repo/ui";
import { FormDialog } from "@/features/applications/components/FormDialog";
import { describeError } from "@/lib/api-error";
import { useCopy } from "@/i18n";
import { useWebhookMutations } from "../api/webhooks";
import type { WebhookEndpoint } from "../model/types";
import {
  EMPTY_WEBHOOK_DRAFT, WEBHOOK_EVENTS, toWebhookBody, toggleEvent, validateWebhookDraft, type WebhookDraft,
} from "../model/webhooks";

export interface CreateWebhookDialogProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (endpoint: WebhookEndpoint) => void;
}

export function CreateWebhookDialog({ slug, open, onOpenChange, onCreated }: CreateWebhookDialogProps) {
  const { t, tk } = useCopy();
  const { create } = useWebhookMutations(slug);
  const [draft, setDraft] = useState<WebhookDraft>(EMPTY_WEBHOOK_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();

  useEffect(() => {
    if (!open) {
      setDraft(EMPTY_WEBHOOK_DRAFT);
      setSubmitted(false);
      setServerError(undefined);
    }
  }, [open]);

  const errors = submitted ? validateWebhookDraft(draft) : [];

  const onSubmit = async () => {
    setSubmitted(true);
    if (validateWebhookDraft(draft).length > 0) return;
    setServerError(undefined);
    try {
      onCreated(await create.mutateAsync(toWebhookBody(draft)));
      create.reset();
      onOpenChange(false);
    } catch (error: unknown) {
      setServerError(describeError(error).message);
    }
  };

  const f = "tenantIntegrations.webhooks.form" as const;
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
      <FormField label={t(`${f}.url`)} required error={errors.includes("url") ? t("tenantIntegrations.common.invalidUrl") : undefined}>
        {(c) => <SentryInput {...c} type="url" value={draft.url} spellCheck={false} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />}
      </FormField>
      <FormField label={t(`${f}.description2`)} optionalLabel={t("common.labels.optional")}>
        {(c) => <SentryInput {...c} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />}
      </FormField>
      <fieldset className="space-y-2" aria-describedby={errors.includes("events") ? "webhook-events-error" : undefined}>
        <legend className="font-display text-[13px] font-medium">{t(`${f}.events`)}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {WEBHOOK_EVENTS.map((event) => (
            <div key={event} className="flex items-center gap-2">
              <Checkbox
                id={`webhook-event-${event}`}
                checked={draft.events.includes(event)}
                onCheckedChange={() => setDraft({ ...draft, events: toggleEvent(draft.events, event) })}
              />
              <Label htmlFor={`webhook-event-${event}`} className="flex flex-col items-start">
                <span>{tk(`tenantIntegrations.webhooks.events.${event}`)}</span>
                <code className="font-mono text-[11px] font-normal text-muted-foreground">{event}</code>
              </Label>
            </div>
          ))}
        </div>
        {errors.includes("events") && (
          <p id="webhook-events-error" role="alert" className="font-body text-xs text-destructive">{t(`${f}.eventsRequired`)}</p>
        )}
      </fieldset>
    </FormDialog>
  );
}
