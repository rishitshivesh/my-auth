import { Heading, Text } from "@react-email/components"
import { EmailLayout } from "../components/layout"
import { Reference } from "../components/reference"
import { theme } from "../components/theme"
import type { PasskeyAddedProps } from "../types"

export const subject = () => "A passkey was added to your account"

export default function PasskeyAdded({
  name,
  when,
  ip,
  requestId,
  tenantName,
  brandName,
}: PasskeyAddedProps) {
  return (
    <EmailLayout
      preview="A passkey was added"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        A passkey was added
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        A new passkey was added to your account on {when}
        {ip ? ` from ${ip}` : ""}. You can now use it to sign in.
      </Text>
      <Text style={theme.text}>
        If this was not you, reset your password right away and contact support.
      </Text>
      <Reference requestId={requestId} />
    </EmailLayout>
  )
}

PasskeyAdded.PreviewProps = {
  name: "Alice",
  when: "14 Oct 2026, 10:32 UTC",
  ip: "203.0.113.7",
} satisfies PasskeyAddedProps
