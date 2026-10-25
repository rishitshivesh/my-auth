"use client";

import type { InputHTMLAttributes } from "react";
import { FormField } from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "className"> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  optionalLabel?: string;
  /** Render identifiers (names, JSON, ids) in the mono role. */
  mono?: boolean;
}

/** FormField + token-styled input; the single text input used by the access and people forms. */
export function TextField({ label, value, onChange, hint, error, optionalLabel, mono, required, ...rest }: TextFieldProps) {
  return (
    <FormField label={label} hint={hint} error={error} required={required} optionalLabel={optionalLabel}>
      {(control) => (
        <input
          {...rest}
          {...control}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "flex h-[42px] w-full min-w-0 rounded-sm border border-border bg-muted px-3 text-sm text-foreground",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive",
            mono ? "font-mono" : "font-body",
          )}
        />
      )}
    </FormField>
  );
}
