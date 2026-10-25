import { FormField, OtpInput } from "@repo/ui";
import { OTP_LENGTH } from "@/constants/limits";

export interface CodeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Fires when all digits are present (typed, pasted or autofilled). */
  onComplete?: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  length?: number;
}

export function CodeField({ label, value, onChange, onComplete, error, hint, disabled, autoFocus, length = OTP_LENGTH }: CodeFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required>
      {(control) => (
        <OtpInput
          id={control.id}
          label={label}
          length={length}
          value={value}
          onChange={onChange}
          onComplete={onComplete}
          invalid={Boolean(error)}
          describedBy={control["aria-describedby"]}
          disabled={disabled}
          autoFocus={autoFocus}
        />
      )}
    </FormField>
  );
}
