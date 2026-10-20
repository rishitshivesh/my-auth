import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { TenantSuspendedProps } from "../types"

export const subject = ({ tenantName }: TenantSuspendedProps) =>
  `${tenantName} was suspended on ${BRAND_NAME}`

// Deliberately gives no reason: the operator's note stays internal.
export default function TenantSuspended({
  name,
  tenantName,
  brandName,
}: TenantSuspendedProps) {
  return (
    <EmailLayout
      preview={`${tenantName} was suspended`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Your tenant was suspended
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        The tenant {tenantName} was suspended. Nobody in it can use it until it
        is restored. Your data is kept.
      </Text>
      <Text style={theme.small}>
        If you think this is a mistake, contact support.
      </Text>
    </EmailLayout>
  )
}

TenantSuspended.PreviewProps = {
  name: "Alice",
  tenantName: "Acme Studio",
} satisfies TenantSuspendedProps
