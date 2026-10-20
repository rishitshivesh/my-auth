import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { ActionButton } from "../components/action-button"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { TenantDeletionScheduledProps } from "../types"

export const subject = ({ tenantName }: TenantDeletionScheduledProps) =>
  `${tenantName} will be deleted on ${BRAND_NAME}`

export default function TenantDeletionScheduled({
  name,
  tenantName,
  deleteOn,
  cancelUrl,
  brandName,
}: TenantDeletionScheduledProps) {
  return (
    <EmailLayout
      preview={`${tenantName} will be deleted on ${deleteOn}`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Your tenant will be deleted
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Deletion of the tenant {tenantName} was requested. Nobody can use it
        now, and everything in it will be removed on {deleteOn}. Until then an
        owner can cancel.
      </Text>
      <ActionButton href={cancelUrl} label="Cancel deletion" />
      <Text style={theme.small}>
        If you did not expect this, cancel it and change your password.
      </Text>
    </EmailLayout>
  )
}

TenantDeletionScheduled.PreviewProps = {
  name: "Alice",
  tenantName: "Acme Studio",
  deleteOn: "15 Nov 2026",
  cancelUrl: "https://sentry.example.com/u/login",
} satisfies TenantDeletionScheduledProps
