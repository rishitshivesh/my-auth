"use client"

import { Input, Label } from "@repo/ui"


interface EmailInputProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
}

export function EmailInput({
  label = "Email",
  placeholder = "you@example.com",
  value,
  onChange,
  error,
  required,
}: EmailInputProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="email"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={error ? "border-destructive" : ""}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
