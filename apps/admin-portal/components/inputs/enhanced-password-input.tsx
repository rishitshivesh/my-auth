"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Input, Label } from "@repo/ui"
import { Eye, EyeOff, CheckCircle2, Circle } from "lucide-react"

interface EnhancedPasswordInputProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  showStrength?: boolean
  policy?: {
    minLength?: number
    requireUppercase?: boolean
    requireNumbers?: boolean
    requireSpecialChars?: boolean
  }
  primaryColor?: string
}

export function EnhancedPasswordInput({
  label = "Password",
  placeholder = "Enter password",
  value,
  onChange,
  error,
  required,
  showStrength = true,
  policy = {
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  },
  primaryColor = "#6366f1",
}: EnhancedPasswordInputProps) {
  const [show, setShow] = useState(false)

  // Calculate strength
  const getStrength = () => {
    let strength = 0
    if (value.length >= (policy.minLength || 8)) strength++
    if (policy.requireUppercase && /[A-Z]/.test(value)) strength++
    if (policy.requireNumbers && /\d/.test(value)) strength++
    if (policy.requireSpecialChars && /[^a-zA-Z\d]/.test(value)) strength++
    return strength
  }

  // Validate policy requirements
  const validatePolicy = () => {
    const checks = {
      length: value.length >= (policy.minLength || 8),
      uppercase: !policy.requireUppercase || /[A-Z]/.test(value),
      numbers: !policy.requireNumbers || /\d/.test(value),
      special: !policy.requireSpecialChars || /[^a-zA-Z\d]/.test(value),
    }
    return checks
  }

  const strength = getStrength()
  const checks = validatePolicy()
  const strengthLabels = ["Weak", "Fair", "Good", "Strong", "Very Strong"]
  const strengthColors = ["bg-red-500", "bg-yellow-500", "bg-blue-500", "bg-green-500", "bg-emerald-500"]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <motion.button
          type="button"
          onClick={() => setShow(!show)}
          className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {show ? (
            <motion.div
              key="hide"
              initial={{ opacity: 0, rotate: -180 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 180 }}
              transition={{ duration: 0.2 }}
            >
              <EyeOff className="h-4 w-4" />
            </motion.div>
          ) : (
            <motion.div
              key="show"
              initial={{ opacity: 0, rotate: -180 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 180 }}
              transition={{ duration: 0.2 }}
            >
              <Eye className="h-4 w-4" />
            </motion.div>
          )}
        </motion.button>
      </div>

      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Input
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={error ? "border-destructive" : ""}
        />
      </motion.div>

      {showStrength && value && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-2"
        >
          {/* Strength meter */}
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= strength ? strengthColors[strength - 1] : "bg-muted"
                }`}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
              />
            ))}
          </div>

          {/* Strength label */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Strength:{" "}
              <span className={`font-semibold text-${strength > 2 ? "green" : strength > 1 ? "yellow" : "red"}-500`}>
                {strengthLabels[strength - 1]}
              </span>
            </p>
          </div>

          {/* Policy requirements */}
          {policy && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="space-y-1 rounded-md bg-muted/30 p-3"
            >
              {policy.minLength && (
                <PolicyCheck met={checks.length} label={`At least ${policy.minLength} characters`} />
              )}
              {policy.requireUppercase && <PolicyCheck met={checks.uppercase} label="One uppercase letter" />}
              {policy.requireNumbers && <PolicyCheck met={checks.numbers} label="One number" />}
              {policy.requireSpecialChars && <PolicyCheck met={checks.special} label="One special character" />}
            </motion.div>
          )}
        </motion.div>
      )}

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="text-sm text-destructive"
        >
          {error}
        </motion.p>
      )}
    </div>
  )
}

interface PolicyCheckProps {
  met: boolean
  label: string
}

function PolicyCheck({ met, label }: PolicyCheckProps) {
  return (
    <motion.div className="flex items-center gap-2 text-xs" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
      >
        {met ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </motion.div>
      <span className={met ? "text-muted-foreground" : "text-muted-foreground"}>{label}</span>
    </motion.div>
  )
}
