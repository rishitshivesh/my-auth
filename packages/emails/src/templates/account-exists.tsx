import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { ActionButton } from "../components/action-button"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import { Link } from "@react-email/components"
import type { AccountExistsProps } from "../types"

export const subject = () => `You already have a ${BRAND_NAME} account`

export default function AccountExists({
  name,
  signInUrl,
  resetUrl,
  tenantName,
  brandName,
}: AccountExistsProps) {
  return (
    <EmailLayout
      preview="Someone tried to sign up with your email"
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        You already have an account
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Someone tried to sign up with this email address, but it already has a{" "}
        {BRAND_NAME} account. If that was you, sign in instead.
      </Text>
      <ActionButton href={signInUrl} label="Sign in" />
      <Text style={theme.small}>
        Forgot your password? Reset it here:{" "}
        <Link href={resetUrl} style={theme.link}>
          {resetUrl}
        </Link>
      </Text>
    </EmailLayout>
  )
}

AccountExists.PreviewProps = {
  name: "Alice",
  signInUrl: "https://sentry.example.com/u/login",
  resetUrl: "https://sentry.example.com/u/forgot-password",
} satisfies AccountExistsProps
