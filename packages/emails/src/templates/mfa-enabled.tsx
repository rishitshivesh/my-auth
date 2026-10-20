import { Heading, Text } from "@react-email/components"
import { EmailLayout } from "../components/layout"
import { Reference } from "../components/reference"
import { theme } from "../components/theme"
import type { MfaEnabledProps } from "../types"

export const subject = () => "Two-step verification is now on"

export default function MfaEnabled({
  name,
  when,
  ip,
  requestId,
  tenantName,
  brandName,
}: MfaEnabledProps) {
  return (
    <EmailLayout
      preview="Two-step verification is on"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Two-step verification is on
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Two-step verification was turned on for your account on {when}
        {ip ? ` from ${ip}` : ""}. From now on you will need a code from your authenticator app, or a recovery code, to sign in.
      </Text>
      <Text style={theme.text}>
        If this was not you, reset your password right away and contact support.
      </Text>
      <Reference requestId={requestId} />
    </EmailLayout>
  )
}

MfaEnabled.PreviewProps = {
  name: "Alice",
  when: "14 Oct 2026, 10:32 UTC",
  ip: "203.0.113.7",
} satisfies MfaEnabledProps
