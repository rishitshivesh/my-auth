import type { ComponentProps } from "react";
import { FormField, Input } from "@repo/ui";

export interface FieldInputProps extends Omit<ComponentProps<"input">, "id" | "children"> {
  label: string;
  hint?: string;
  error?: string;
  optionalLabel?: string;
}

/** Labelled input with hint/error wired through aria-describedby. */
export function FieldInput({ label, hint, error, optionalLabel, required, ...input }: FieldInputProps) {
  return (
    <FormField label={label} hint={hint} error={error} required={required} optionalLabel={optionalLabel}>
      {(control) => <Input {...input} {...control} />}
    </FormField>
  );
}
