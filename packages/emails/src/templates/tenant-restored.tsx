import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { ActionButton } from "../components/action-button"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { TenantRestoredProps } from "../types"

export const subject = ({ tenantName }: TenantRestoredProps) =>
  `${tenantName} was restored on ${BRAND_NAME}`

export default function TenantRestored({
  name,
  tenantName,
  signInUrl,
  brandName,
}: TenantRestoredProps) {
  return (
    <EmailLayout
      preview={`${tenantName} was restored`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Your tenant was restored
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        The tenant {tenantName} is active again. Everyone in it can use it as
        before.
      </Text>
      <ActionButton href={signInUrl} label={`Open ${BRAND_NAME}`} />
    </EmailLayout>
  )
}

TenantRestored.PreviewProps = {
  name: "Alice",
  tenantName: "Acme Studio",
  signInUrl: "https://sentry.example.com/u/login",
} satisfies TenantRestoredProps
