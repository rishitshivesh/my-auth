'use client';

import * as React from 'react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { cn } from '../../lib/utils';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../ui/input-otp';

export interface OtpInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  /** Fires once when every slot is filled (typing, paste or autofill). */
  onComplete?: (value: string) => void;
  /** Accessible name of the whole input. */
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Id of an element describing the input (hint or error). */
  describedBy?: string;
  autoFocus?: boolean;
  className?: string;
  id?: string;
}

/** One-time-code entry: paste and OS autofill (autocomplete=one-time-code) supported. */
export function OtpInput({
  length, value, onChange, onComplete, label, disabled, invalid, describedBy, autoFocus, className, id,
}: OtpInputProps) {
  return (
    <InputOTP
      id={id}
      maxLength={length}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      containerClassName={cn('justify-center', className)}
    >
      <InputOTPGroup className={cn(invalid && '[&_[data-slot=input-otp-slot]]:border-destructive')}>
        {Array.from({ length }, (_, index) => (
          <InputOTPSlot key={index} index={index} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
