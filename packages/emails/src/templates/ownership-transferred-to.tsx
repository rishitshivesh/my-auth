import { Heading, Text } from "@react-email/components"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { OwnershipTransferredToProps } from "../types"

export const subject = ({ tenantName }: OwnershipTransferredToProps) =>
  `You are now the owner of ${tenantName}`

export default function OwnershipTransferredTo({
  name,
  tenantName,
  previousOwnerName,
  when,
  ip,
  brandName,
}: OwnershipTransferredToProps) {
  return (
    <EmailLayout
      preview={`You are now the owner of ${tenantName}`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        You are now an owner
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        On {when}
        {ip ? ` from ${ip}` : ""} {previousOwnerName} made you the owner of{" "}
        {tenantName}. You can now manage its members and settings.
      </Text>
      <Text style={theme.text}>
        If you did not expect this, contact {previousOwnerName} or support.
      </Text>
    </EmailLayout>
  )
}

OwnershipTransferredTo.PreviewProps = {
  name: "Bob",
  tenantName: "Acme Studio",
  previousOwnerName: "Alice",
  when: "14 Oct 2026, 10:32 UTC",
  ip: "203.0.113.7",
} satisfies OwnershipTransferredToProps
