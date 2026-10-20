import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { AccountSuspendedProps } from "../types"

export const subject = () => `Your ${BRAND_NAME} account was suspended`

// Deliberately gives no reason: the operator's note stays internal.
export default function AccountSuspended({
  name,
  tenantName,
  brandName,
}: AccountSuspendedProps) {
  return (
    <EmailLayout
      preview="Your account was suspended"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Your account was suspended
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Your {BRAND_NAME} account was suspended. You have been signed out on
        every device and cannot sign in until it is restored.
      </Text>
      <Text style={theme.small}>
        If you think this is a mistake, contact support.
      </Text>
    </EmailLayout>
  )
}

AccountSuspended.PreviewProps = {
  name: "Alice",
} satisfies AccountSuspendedProps
