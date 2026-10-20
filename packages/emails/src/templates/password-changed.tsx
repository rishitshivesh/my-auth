import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { EmailLayout } from "../components/layout"
import { Reference } from "../components/reference"
import { theme } from "../components/theme"
import type { PasswordChangedProps } from "../types"

export const subject = () => `Your ${BRAND_NAME} password was changed`

export default function PasswordChanged({
  name,
  when,
  ip,
  requestId,
  tenantName,
  brandName,
}: PasswordChangedProps) {
  return (
    <EmailLayout
      preview="Your password was changed"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Your password was changed
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Your password was changed on {when}
        {ip ? ` from ${ip}` : ""}. Other devices were signed out.
      </Text>
      <Text style={theme.text}>
        If this was you, nothing else is needed. If it was not, reset your
        password right away and contact support.
      </Text>
      <Reference requestId={requestId} />
    </EmailLayout>
  )
}

PasswordChanged.PreviewProps = {
  name: "Alice",
  when: "14 Oct 2026, 10:32 UTC",
  ip: "203.0.113.7",
} satisfies PasswordChangedProps
