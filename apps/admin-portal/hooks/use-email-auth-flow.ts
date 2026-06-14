"use client"

import { useAuth } from "@scrolloop/sdk"
import { useState } from "react"

export interface LoginIntentResponse {
  exists: boolean
  email: string
  methods: {
    password: boolean
    magicLink: boolean
    passkey: boolean
    mfa: boolean
    social: string[]
  }
  preferredMethod: "password" | "magicLink" | "passkey"
  branding: {
    logo: string
    primaryColor: string
    companyName: string
  }
}

export type AuthStep = "email" | "method-selection" | "credentials" | "mfa"

export interface UseEmailAuthFlowReturn {
  step: AuthStep
  email: string
  selectedMethod: string | null
  loading: boolean
  error: string | null
  loginIntent: LoginIntentResponse | null
  submitEmail: (email: string) => Promise<void>
  selectMethod: (method: string) => void
  goBack: () => void
  reset: () => void
}

export function useEmailAuthFlow(): UseEmailAuthFlowReturn {
  const { loginIntent: loginIntentHandler} = useAuth();
  const [step, setStep] = useState<AuthStep>("email")
  const [email, setEmail] = useState("")
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginIntent, setLoginIntent] = useState<LoginIntentResponse | null>(null)

  const submitEmail = async (inputEmail: string) => {
    setLoading(true)
    setError(null)
    try {
      const response:LoginIntentResponse = await loginIntentHandler({ email: inputEmail });

      setLoginIntent(response)
      setEmail(inputEmail)
      setSelectedMethod(response.preferredMethod)
      setStep("method-selection")
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const selectMethod = (method: string) => {
    setSelectedMethod(method)
    setStep("credentials")
  }

  const goBack = () => {
    if (step === "credentials") {
      setSelectedMethod(null)
      setStep("method-selection")
    } else if (step === "method-selection") {
      setEmail("")
      setLoginIntent(null)
      setSelectedMethod(null)
      setStep("email")
    }
  }

  const reset = () => {
    setStep("email")
    setEmail("")
    setSelectedMethod(null)
    setLoading(false)
    setError(null)
    setLoginIntent(null)
  }

  return {
    step,
    email,
    selectedMethod,
    loading,
    error,
    loginIntent,
    submitEmail,
    selectMethod,
    goBack,
    reset,
  }
}
