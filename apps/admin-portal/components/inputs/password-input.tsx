"use client"

import { useState } from "react"
import { Button, Input, Label } from "@repo/ui"


interface PasswordInputProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  showStrength?: boolean
}

export function PasswordInput({
  label = "Password",
  placeholder = "Enter password",
  value,
  onChange,
  error,
  required,
  showStrength,
}: PasswordInputProps) {
  const [show, setShow] = useState(false)

  const getStrength = () => {
    let strength = 0
    if (value.length >= 8) strength++
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) strength++
    if (/\d/.test(value)) strength++
    if (/[^a-zA-Z\d]/.test(value)) strength++
    return strength
  }

  const strength = getStrength()
  const strengthColor =
    strength === 0
      ? "bg-gray-300"
      : strength === 1
        ? "bg-red-500"
        : strength === 2
          ? "bg-yellow-500"
          : strength === 3
            ? "bg-blue-500"
            : "bg-green-500"

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {show && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShow(!show)} className="h-auto p-0 text-xs">
            {show ? "Hide" : "Show"}
          </Button>
        )}
      </div>
      <Input
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={error ? "border-destructive" : ""}
      />
      {showStrength && (
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= strength ? strengthColor : "bg-gray-200 dark:bg-gray-700"}`}
            />
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
