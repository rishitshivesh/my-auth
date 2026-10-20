import { Heading, Text } from "@react-email/components"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { OwnershipTransferredFromProps } from "../types"

export const subject = ({ tenantName }: OwnershipTransferredFromProps) =>
  `You transferred ownership of ${tenantName}`

export default function OwnershipTransferredFrom({
  name,
  tenantName,
  newOwnerName,
  when,
  ip,
  brandName,
}: OwnershipTransferredFromProps) {
  return (
    <EmailLayout
      preview={`You transferred ownership of ${tenantName}`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Ownership transferred
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        On {when}
        {ip ? ` from ${ip}` : ""} you made {newOwnerName} the owner of{" "}
        {tenantName}. Your role there is now admin.
      </Text>
      <Text style={theme.text}>
        If this was not you, reset your password right away, contact support and
        ask the new owner to review the tenant.
      </Text>
    </EmailLayout>
  )
}

OwnershipTransferredFrom.PreviewProps = {
  name: "Alice",
  tenantName: "Acme Studio",
  newOwnerName: "Bob",
  when: "14 Oct 2026, 10:32 UTC",
  ip: "203.0.113.7",
} satisfies OwnershipTransferredFromProps
