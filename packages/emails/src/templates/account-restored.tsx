import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { ActionButton } from "../components/action-button"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { AccountRestoredProps } from "../types"

export const subject = () => `Your ${BRAND_NAME} account was restored`

export default function AccountRestored({
  name,
  signInUrl,
  tenantName,
  brandName,
}: AccountRestoredProps) {
  return (
    <EmailLayout
      preview="Your account was restored"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Your account was restored
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Your {BRAND_NAME} account is active again. You can sign in as before.
      </Text>
      <ActionButton href={signInUrl} label="Sign in" />
    </EmailLayout>
  )
}

AccountRestored.PreviewProps = {
  name: "Alice",
  signInUrl: "https://sentry.example.com/u/login",
} satisfies AccountRestoredProps
