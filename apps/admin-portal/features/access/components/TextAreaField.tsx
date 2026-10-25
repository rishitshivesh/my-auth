"use client";

import { FormField } from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";

export interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  optionalLabel?: string;
  rows?: number;
  mono?: boolean;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function TextAreaField({
  label, value, onChange, hint, error, optionalLabel, rows = 3, mono, required, disabled, placeholder,
}: TextAreaFieldProps) {
  return (
    <FormField label={label} hint={hint} error={error} required={required} optionalLabel={optionalLabel}>
      {(control) => (
        <textarea
          {...control}
          rows={rows}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "w-full min-w-0 resize-y rounded-sm border border-border bg-muted px-3 py-2 text-sm text-foreground",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive",
            mono ? "font-mono" : "font-body",
          )}
        />
      )}
    </FormField>
  );
}
