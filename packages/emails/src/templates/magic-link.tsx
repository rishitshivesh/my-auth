import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { ActionButton } from "../components/action-button"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { MagicLinkProps } from "../types"

export const subject = () => `Your ${BRAND_NAME} sign-in link`

export default function MagicLink({
  name,
  magicLinkUrl,
  expiresInMinutes,
  tenantName,
  brandName,
}: MagicLinkProps) {
  return (
    <EmailLayout
      preview={`Use this link to sign in to ${BRAND_NAME}`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Sign in with a link
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Use the button below to sign in. The link works once and expires in{" "}
        {expiresInMinutes} minutes.
      </Text>
      <ActionButton href={magicLinkUrl} label="Sign in" />
      <Text style={theme.small}>
        If you did not ask for this, you can ignore this email.
      </Text>
    </EmailLayout>
  )
}

MagicLink.PreviewProps = {
  name: "Alice",
  magicLinkUrl: "https://sentry.example.com/u/magic-link?token=abc123",
  expiresInMinutes: 15,
} satisfies MagicLinkProps
