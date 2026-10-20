import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { ActionButton } from "../components/action-button"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { VerifyEmailProps } from "../types"

export const subject = () => `Confirm your email for ${BRAND_NAME}`

export default function VerifyEmail({
  name,
  verifyUrl,
  expiresInHours,
  tenantName,
  brandName,
}: VerifyEmailProps) {
  return (
    <EmailLayout
      preview={`Confirm your email to finish setting up ${BRAND_NAME}`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Confirm your email
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Confirm this address to finish setting up your {BRAND_NAME} account. The
        link works once and expires in {expiresInHours} hours.
      </Text>
      <ActionButton href={verifyUrl} label="Confirm email" />
    </EmailLayout>
  )
}

VerifyEmail.PreviewProps = {
  name: "Alice",
  verifyUrl: "https://sentry.example.com/u/verify-email?token=abc123",
  expiresInHours: 24,
} satisfies VerifyEmailProps
