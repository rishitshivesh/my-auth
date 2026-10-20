import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { ActionButton } from "../components/action-button"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { TenantDeletionCancelledProps } from "../types"

export const subject = ({ tenantName }: TenantDeletionCancelledProps) =>
  `Deletion of ${tenantName} was cancelled`

export default function TenantDeletionCancelled({
  name,
  tenantName,
  signInUrl,
  brandName,
}: TenantDeletionCancelledProps) {
  return (
    <EmailLayout
      preview={`Deletion of ${tenantName} was cancelled`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Deletion cancelled
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        The tenant {tenantName} will not be deleted. It is active again and
        everyone in it can use it as before.
      </Text>
      <ActionButton href={signInUrl} label={`Open ${BRAND_NAME}`} />
    </EmailLayout>
  )
}

TenantDeletionCancelled.PreviewProps = {
  name: "Alice",
  tenantName: "Acme Studio",
  signInUrl: "https://sentry.example.com/u/login",
} satisfies TenantDeletionCancelledProps
