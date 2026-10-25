"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { SentryButton, copyText } from "@repo/ui";
import { COPY_FEEDBACK_MS } from "@/constants/limits";
import { useCopy } from "@/i18n";

export interface CopyableValueProps {
  label: string;
  value: string;
}

/** Labelled monospace value with a copy button and a polite status announcement. */
export function CopyableValue({ label, value }: CopyableValueProps) {
  const { t } = useCopy();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const onCopy = async () => setState((await copyText(value)) ? "copied" : "failed");

  return (
    <div className="space-y-1.5">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-sm border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
          {value}
        </code>
        <SentryButton
          variant="outline"
          size="sm"
          onClick={onCopy}
          aria-label={t("tenantIntegrations.common.copyValue", { name: label })}
        >
          {state === "copied" ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
        </SentryButton>
      </div>
      <p role="status" aria-live="polite" className="min-h-4 font-body text-xs text-muted-foreground">
        {state === "copied" ? t("tenantIntegrations.common.copiedValue", { name: label }) : null}
        {state === "failed" ? t("tenantIntegrations.common.copyFailed") : null}
      </p>
    </div>
  );
}
