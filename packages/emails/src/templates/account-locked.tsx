import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { EmailLayout } from "../components/layout"
import { Reference } from "../components/reference"
import { theme } from "../components/theme"
import type { AccountLockedProps } from "../types"

export const subject = () => `Your ${BRAND_NAME} account was temporarily locked`

export default function AccountLocked({
  name,
  when,
  ip,
  unlockMinutes,
  requestId,
  tenantName,
  brandName,
}: AccountLockedProps) {
  return (
    <EmailLayout
      preview="Too many failed sign-in attempts"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Your account is temporarily locked
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        After too many failed sign-in attempts on {when}
        {ip ? ` from ${ip}` : ""}, we locked your account. You can try again in{" "}
        {unlockMinutes} minutes.
      </Text>
      <Text style={theme.text}>
        If this was not you, someone may be guessing your password. Reset it
        once the lock ends and contact support.
      </Text>
      <Reference requestId={requestId} />
    </EmailLayout>
  )
}

AccountLocked.PreviewProps = {
  name: "Alice",
  when: "14 Oct 2026, 10:32 UTC",
  ip: "203.0.113.7",
  unlockMinutes: 15,
} satisfies AccountLockedProps
