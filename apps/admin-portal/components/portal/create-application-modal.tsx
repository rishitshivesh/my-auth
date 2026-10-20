"use client"

import { useState } from "react"
import { useCreateTenantClient } from "@/lib/queries"
import { Button } from "@repo/ui"
import { X } from "lucide-react"
import { getErrorMessage } from "@/lib/api-error";

type AppType = "spa" | "m2m" | "web"

interface Props {
  tenantSlug: string
  onClose: () => void
  onCreated: () => void
}

interface AppTypeConfig {
  label: string
  description: string
  grantTypes: string[]
  clientType: "public" | "confidential"
}

const APP_TYPE_CONFIG: Record<AppType, AppTypeConfig> = {
  spa: {
    label: "Single Page App",
    description: "Authorization Code + PKCE, public client",
    grantTypes: ["authorization_code", "refresh_token"],
    clientType: "public",
  },
  m2m: {
    label: "Machine to Machine",
    description: "Client Credentials, confidential",
    grantTypes: ["client_credentials"],
    clientType: "confidential",
  },
  web: {
    label: "Web Application",
    description: "Authorization Code, confidential",
    grantTypes: ["authorization_code", "refresh_token"],
    clientType: "confidential",
  },
}

export function CreateApplicationModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [appType, setAppType] = useState<AppType | null>(null)
  const [name, setName] = useState("")
  const [callbackUrls, setCallbackUrls] = useState("")
  const [createdSecret, setCreatedSecret] = useState("")

  const createClient = useCreateTenantClient()

  function handleCreate() {
    if (!appType || !name) return
    const config = APP_TYPE_CONFIG[appType]
    const redirectUris =
      appType !== "m2m"
        ? callbackUrls
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean)
        : []

    createClient.mutate(
      {
        name,
        clientType: config.clientType,
        grantTypes: config.grantTypes,
        redirectUris,
      },
      {
        onSuccess: (data) => {
          if (data.clientSecret) {
            setCreatedSecret(data.clientSecret)
          }
          setStep(3)
          onCreated()
        },
      }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-2xl p-6 w-full max-w-lg shadow-xl relative">
        <button
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="font-semibold text-foreground mb-1">Create Application</h2>
        <p className="text-sm text-muted-foreground mb-6">Step {step} of 3</p>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground mb-3">Choose application type</p>
            {(Object.entries(APP_TYPE_CONFIG) as [AppType, AppTypeConfig][]).map(([key, cfg]) => (
              <button
                key={key}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${
                  appType === key
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-border hover:border-[var(--color-accent-soft)]"
                }`}
                onClick={() => setAppType(key)}
              >
                <p className="font-medium text-sm text-foreground">{cfg.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
              </button>
            ))}
            <Button
              className="w-full mt-4"
              disabled={!appType}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Name *</label>
              <input
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-transparent"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Application"
              />
            </div>
            {appType !== "m2m" && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">
                  Allowed Callback URLs *
                </label>
                <textarea
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-transparent min-h-[80px] resize-y"
                  value={callbackUrls}
                  onChange={(e) => setCallbackUrls(e.target.value)}
                  placeholder={"https://app.example.com/callback\nhttp://localhost:3000/callback"}
                />
                <p className="text-xs text-muted-foreground mt-1">One URL per line</p>
              </div>
            )}
            {createClient.isError && (
              <p className="text-sm text-destructive">
                {getErrorMessage(createClient.error, "Failed to create application")}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={
                  !name ||
                  (appType !== "m2m" && !callbackUrls.trim()) ||
                  createClient.isPending
                }
                onClick={handleCreate}
              >
                {createClient.isPending ? "Creating..." : "Create Application"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-sm font-medium text-amber-800">
                This secret will never be shown again. Copy it now.
              </p>
            </div>
            {createdSecret && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">
                  Client Secret
                </label>
                <code className="block text-xs font-mono bg-black/5 rounded-lg p-3 break-all">
                  {createdSecret}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => navigator.clipboard.writeText(createdSecret)}
                >
                  Copy to clipboard
                </Button>
              </div>
            )}
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
