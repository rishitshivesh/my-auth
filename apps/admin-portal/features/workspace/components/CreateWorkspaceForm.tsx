"use client";

import { useState } from "react";
import Link from "next/link";
import { SentryButton, StepFlow } from "@repo/ui";
import { authRoutes, tenantRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { TextField } from "@/features/access/components/TextField";
import { useSlugCheck } from "../api/use-workspace";
import {
  canContinueDetails, slugify, validateDetails, validateOwner, type OwnerDetails, type RegisterBody,
} from "../model/workspace-form";
import { buildRegisterBody } from "../model/workspace-form";

type Step = "details" | "owner" | "done";

export interface CreateWorkspaceFormProps {
  pending: boolean;
  created: boolean;
  error?: string;
  onSubmit: (body: RegisterBody) => void;
  onCancel?: () => void;
}

export function CreateWorkspaceForm({ pending, created, error, onSubmit, onCancel }: CreateWorkspaceFormProps) {
  const { t, tk } = useCopy();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [owner, setOwner] = useState<OwnerDetails>({ name: "", email: "", password: "" });
  const [touched, setTouched] = useState(false);
  const check = useSlugCheck(slug);
  const detailErrors = validateDetails({ name, slug });
  const ownerErrors = validateOwner(owner);
  const current: Step = created ? "done" : step;
  const steps = [
    { id: "details", label: t("workspace.create.steps.details") },
    { id: "owner", label: t("workspace.create.steps.owner") },
    { id: "done", label: t("workspace.create.steps.done") },
  ];

  const onName = (value: string) => { setName(value); if (!slugEdited) setSlug(slugify(value)); };
  const slugMessage = check.state === "idle" ? undefined : tk(`workspace.create.slugState.${check.state}`, { slug });

  return (
    <StepFlow
      steps={steps}
      currentId={current}
      progressLabel={t("workspace.create.progress", { current: steps.findIndex((s) => s.id === current) + 1, total: steps.length })}
      stepLabel={(s, i) => t("workspace.create.stepLabel", { number: i + 1, label: s.label })}
    >
      {current === "details" && (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); setTouched(true); if (canContinueDetails(detailErrors, check.state)) { setTouched(false); setStep("owner"); } }}
        >
          <TextField label={t("workspace.create.name")} value={name} onChange={onName} required autoComplete="organization" error={touched && detailErrors.name ? tk(`workspace.create.errors.${detailErrors.name}`) : undefined} />
          <TextField
            label={t("workspace.create.slug")}
            hint={slugMessage ?? t("workspace.create.slugHint")}
            value={slug}
            onChange={(v) => { setSlugEdited(true); setSlug(v.toLowerCase()); }}
            required
            mono
            autoComplete="off"
            error={(touched || slug) && detailErrors.slug ? tk(`workspace.create.errors.${detailErrors.slug}`, { min: 4, max: 63 }) : check.state === "taken" ? (check.reason ?? slugMessage) : undefined}
          />
          <p aria-live="polite" className="sr-only">{slugMessage ?? ""}</p>
          <div className="flex flex-wrap gap-2">
            {onCancel && <SentryButton type="button" variant="outline" onClick={onCancel}>{t("common.actions.cancel")}</SentryButton>}
            <SentryButton type="submit" variant="primary" disabled={check.state === "checking"}>{t("common.actions.continue")}</SentryButton>
          </div>
        </form>
      )}
      {current === "owner" && (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); setTouched(true); if (Object.keys(ownerErrors).length === 0 && !pending) onSubmit(buildRegisterBody({ name, slug }, owner)); }}
        >
          <p className="font-body text-sm text-muted-foreground">{t("workspace.create.ownerIntro", { name: name.trim() })}</p>
          <TextField label={t("workspace.create.ownerName")} value={owner.name} onChange={(v) => setOwner((o) => ({ ...o, name: v }))} required autoComplete="name" error={touched && ownerErrors.name ? tk(`workspace.create.ownerErrors.${ownerErrors.name}`) : undefined} />
          <TextField label={t("workspace.create.ownerEmail")} type="email" value={owner.email} onChange={(v) => setOwner((o) => ({ ...o, email: v }))} required autoComplete="email" error={touched && ownerErrors.email ? tk(`workspace.create.ownerErrors.${ownerErrors.email}`) : undefined} />
          <TextField label={t("workspace.create.ownerPassword")} hint={t("workspace.create.passwordHint")} type="password" value={owner.password} onChange={(v) => setOwner((o) => ({ ...o, password: v }))} required autoComplete="new-password" error={touched && ownerErrors.password ? tk(`workspace.create.ownerErrors.${ownerErrors.password}`) : undefined} />
          {error && <p role="alert" className="break-words font-body text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <SentryButton type="button" variant="outline" disabled={pending} onClick={() => setStep("details")}>{t("common.actions.back")}</SentryButton>
            <SentryButton type="submit" variant="primary" isLoading={pending}>{t("workspace.create.submit")}</SentryButton>
          </div>
        </form>
      )}
      {current === "done" && (
        <div role="status" aria-live="polite" className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-foreground">{t("workspace.create.doneTitle", { name: name.trim() })}</h2>
          <p className="font-body text-sm text-muted-foreground">{t("workspace.create.doneBody", { email: owner.email.trim() })}</p>
          <div className="flex flex-wrap gap-2">
            <Link href={authRoutes.login({ email: owner.email.trim() })} className="inline-flex h-[42px] items-center rounded-sm bg-primary px-6 font-display text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t("workspace.create.signIn")}
            </Link>
            <Link href={tenantRoutes(slug).dashboard()} className="inline-flex h-[42px] items-center rounded-sm border border-border px-6 font-display text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t("workspace.create.openWorkspace")}
            </Link>
          </div>
        </div>
      )}
    </StepFlow>
  );
}
