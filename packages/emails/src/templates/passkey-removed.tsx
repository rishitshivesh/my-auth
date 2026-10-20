import { Heading, Text } from "@react-email/components"
import { EmailLayout } from "../components/layout"
import { Reference } from "../components/reference"
import { theme } from "../components/theme"
import type { PasskeyRemovedProps } from "../types"

export const subject = () => "A passkey was removed from your account"

export default function PasskeyRemoved({
  name,
  when,
  ip,
  requestId,
  tenantName,
  brandName,
}: PasskeyRemovedProps) {
  return (
    <EmailLayout
      preview="A passkey was removed"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        A passkey was removed
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        A passkey was removed from your account on {when}
        {ip ? ` from ${ip}` : ""}. It can no longer be used to sign in.
      </Text>
      <Text style={theme.text}>
        If this was not you, reset your password right away and contact support.
      </Text>
      <Reference requestId={requestId} />
    </EmailLayout>
  )
}

PasskeyRemoved.PreviewProps = {
  name: "Alice",
  when: "14 Oct 2026, 10:32 UTC",
  ip: "203.0.113.7",
} satisfies PasskeyRemovedProps
