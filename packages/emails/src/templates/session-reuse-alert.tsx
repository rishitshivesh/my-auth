import { Heading, Text } from "@react-email/components"
import { EmailLayout } from "../components/layout"
import { Reference } from "../components/reference"
import { theme } from "../components/theme"
import type { SessionReuseAlertProps } from "../types"

export const subject = () => "Security alert: a session was signed out"

export default function SessionReuseAlert({
  name,
  when,
  ip,
  requestId,
  tenantName,
  brandName,
}: SessionReuseAlertProps) {
  return (
    <EmailLayout
      preview="We signed out a session that looked stolen"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        We signed out a session
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        On {when}
        {ip ? ` from ${ip}` : ""}, a sign-in token for your account was used
        twice. That can mean it was copied, so we ended that session to keep
        your account safe.
      </Text>
      <Text style={theme.text}>
        Sign in again to continue. If you did not expect this, change your
        password.
      </Text>
      <Reference requestId={requestId} />
    </EmailLayout>
  )
}

SessionReuseAlert.PreviewProps = {
  name: "Alice",
  when: "14 Oct 2026, 10:32 UTC",
  ip: "203.0.113.7",
} satisfies SessionReuseAlertProps
