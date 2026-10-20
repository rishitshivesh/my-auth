import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { ActionButton } from "../components/action-button"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { InvitationProps } from "../types"

export const subject = ({
  inviterName,
  tenantName,
  newTenant,
}: InvitationProps) =>
  newTenant
    ? `Your invitation to ${BRAND_NAME} is ready`
    : `${inviterName} invited you to ${tenantName} on ${BRAND_NAME}`

export default function Invitation({
  inviterName,
  tenantName,
  role,
  acceptUrl,
  expiresInDays,
  newTenant,
  brandName,
}: InvitationProps) {
  if (newTenant) {
    return (
      <EmailLayout
        preview={`Your invitation to ${BRAND_NAME} is ready`}
        brandName={brandName}
      >
        <Heading as="h1" style={theme.heading}>
          Your spot on {BRAND_NAME} is ready
        </Heading>
        <Text style={theme.text}>
          Thanks for waiting. Create your account to get your own tenant on{" "}
          {BRAND_NAME}. The invitation works once and expires in {expiresInDays}{" "}
          days.
        </Text>
        <ActionButton href={acceptUrl} label="Create your account" />
      </EmailLayout>
    )
  }
  return (
    <EmailLayout
      preview={`${inviterName} invited you to ${tenantName}`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Join {tenantName}
      </Heading>
      <Text style={theme.text}>
        {inviterName} invited you to join {tenantName} on {BRAND_NAME} as {role}
        . The invitation works once and expires in {expiresInDays} days.
      </Text>
      <ActionButton href={acceptUrl} label="Accept invitation" />
    </EmailLayout>
  )
}

Invitation.PreviewProps = {
  inviterName: "Bob",
  tenantName: "Acme Studio",
  role: "member",
  acceptUrl: "https://sentry.example.com/invite/abc123",
  expiresInDays: 7,
} satisfies InvitationProps
