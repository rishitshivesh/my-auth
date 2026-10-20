import { Heading, Text } from "@react-email/components"
import { EmailLayout } from "../components/layout"
import { Reference } from "../components/reference"
import { theme } from "../components/theme"
import type { MfaDisabledProps } from "../types"

export const subject = () => "Two-step verification is now off"

export default function MfaDisabled({
  name,
  when,
  ip,
  requestId,
  tenantName,
  brandName,
}: MfaDisabledProps) {
  return (
    <EmailLayout
      preview="Two-step verification is off"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Two-step verification is off
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Two-step verification was turned off for your account on {when}
        {ip ? ` from ${ip}` : ""}. Your account is now protected by your password alone.
      </Text>
      <Text style={theme.text}>
        If this was not you, reset your password right away and contact support.
      </Text>
      <Reference requestId={requestId} />
    </EmailLayout>
  )
}

MfaDisabled.PreviewProps = {
  name: "Alice",
  when: "14 Oct 2026, 10:32 UTC",
  ip: "203.0.113.7",
} satisfies MfaDisabledProps
