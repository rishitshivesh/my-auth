"use client";

import { FormField } from "@repo/ui";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  hint?: string;
  disabled?: boolean;
}

export const CONTROL_CLASS =
  "h-[42px] w-full rounded-sm border border-border bg-muted px-3 font-body text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Native select wrapped in the shared FormField wiring. */
export function SelectField({ label, value, options, onChange, hint, disabled }: SelectFieldProps) {
  return (
    <FormField label={label} hint={hint}>
      {(control) => (
        <select {...control} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={CONTROL_CLASS}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )}
    </FormField>
  );
}
