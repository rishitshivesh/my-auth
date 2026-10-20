import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { ActionButton } from "../components/action-button"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { SocialAccountLinkRequestProps } from "../types"

export const subject = ({ provider }: SocialAccountLinkRequestProps) =>
  `Confirm linking ${provider} to your ${BRAND_NAME} account`

export default function SocialAccountLinkRequest({
  name,
  provider,
  confirmUrl,
  expiresInMinutes,
  tenantName,
  brandName,
}: SocialAccountLinkRequestProps) {
  return (
    <EmailLayout
      preview={`Confirm linking ${provider} to your account`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Link your {provider} account
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Someone signed in with {provider} using this email address. To connect
        it to your existing {BRAND_NAME} account, confirm below. The link works
        once and expires in {expiresInMinutes} minutes.
      </Text>
      <ActionButton href={confirmUrl} label={`Link ${provider}`} />
      <Text style={theme.small}>
        If this was not you, ignore this email and nothing will be linked.
      </Text>
    </EmailLayout>
  )
}

SocialAccountLinkRequest.PreviewProps = {
  name: "Alice",
  provider: "Google",
  confirmUrl: "https://sentry.example.com/u/link-account?token=abc123",
  expiresInMinutes: 30,
} satisfies SocialAccountLinkRequestProps
