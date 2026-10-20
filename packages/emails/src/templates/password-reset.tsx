import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { ActionButton } from "../components/action-button"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { PasswordResetProps } from "../types"

export const subject = () => `Reset your ${BRAND_NAME} password`

export default function PasswordReset({
  name,
  resetUrl,
  expiresInMinutes,
  tenantName,
  brandName,
}: PasswordResetProps) {
  return (
    <EmailLayout
      preview="Use this link to choose a new password"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Reset your password
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        We received a request to reset your password. The link works once and
        expires in {expiresInMinutes} minutes. Using it signs you out of every
        device.
      </Text>
      <ActionButton href={resetUrl} label="Choose a new password" />
      <Text style={theme.small}>
        If you did not ask for this, your password is unchanged and you can
        ignore this email.
      </Text>
    </EmailLayout>
  )
}

PasswordReset.PreviewProps = {
  name: "Alice",
  resetUrl: "https://sentry.example.com/u/reset-password?token=abc123",
  expiresInMinutes: 60,
} satisfies PasswordResetProps
