import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { EmailLayout } from "../components/layout"
import { Reference } from "../components/reference"
import { theme } from "../components/theme"
import type { SignInMethodChangedProps } from "../types"

export const subject = ({ method, action }: SignInMethodChangedProps) =>
  `${method} sign-in was ${action} on your ${BRAND_NAME} account`

export default function SignInMethodChanged({
  name,
  method,
  action,
  when,
  ip,
  requestId,
  tenantName,
  brandName,
}: SignInMethodChangedProps) {
  return (
    <EmailLayout
      preview={`${method} sign-in was ${action}`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        {method} sign-in was {action}
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        {method} sign-in was {action} on your account on {when}
        {ip ? ` from ${ip}` : ""}.
      </Text>
      <Text style={theme.text}>
        If this was you, nothing else is needed. If it was not, reset your
        password right away and contact support.
      </Text>
      <Reference requestId={requestId} />
    </EmailLayout>
  )
}

SignInMethodChanged.PreviewProps = {
  name: "Alice",
  method: "Google",
  action: "added",
  when: "14 Oct 2026, 10:32 UTC",
  ip: "203.0.113.7",
} satisfies SignInMethodChangedProps
