"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SentryInput } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { FieldControlProps } from "@repo/ui";

export interface PasswordInputProps {
  control: FieldControlProps;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
}

/** Password field with an accessible visibility toggle (pressed state, keyboard reachable). */
export function PasswordInput({ control, value, onChange, autoComplete, disabled, autoFocus, name = "password" }: PasswordInputProps) {
  const { t } = useCopy();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <SentryInput
        {...control}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        autoCapitalize="none"
        spellCheck={false}
        className="pr-11"
      />
      <button
        type="button"
        aria-pressed={visible}
        aria-label={visible ? t("auth.login.hidePassword") : t("auth.login.showPassword")}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
      </button>
    </div>
  );
}
