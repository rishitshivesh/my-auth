"use client";

import { useId } from "react";

export interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** Labelled checkbox row; a native input keeps keyboard and screen-reader behaviour. */
export function ToggleRow({ label, hint, checked, disabled, onChange }: ToggleRowProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded-xs border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="space-y-0.5">
        <label htmlFor={id} className="block font-display text-sm font-medium text-foreground">{label}</label>
        {hint && <p id={hintId} className="font-body text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
