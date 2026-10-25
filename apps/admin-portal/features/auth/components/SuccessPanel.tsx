"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { SentryButton } from "@repo/ui";

export interface SuccessPanelProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

/** Truthful success (shown only after the server confirmed). Focus moves to the heading. */
export function SuccessPanel({ title, description, actionLabel, onAction }: SuccessPanelProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-success-text">
        <CheckCircle2 aria-hidden="true" className="h-6 w-6" />
      </div>
      <h2 ref={heading} tabIndex={-1} className="font-display text-lg font-semibold text-foreground outline-none">
        {title}
      </h2>
      <p className="font-body text-sm text-muted-foreground">{description}</p>
      <SentryButton type="button" variant="accent" className="mt-2 w-full sm:w-auto" onClick={onAction}>
        {actionLabel}
      </SentryButton>
    </div>
  );
}
