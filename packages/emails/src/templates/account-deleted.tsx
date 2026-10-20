import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { AccountDeletedProps } from "../types"

export const subject = (_props: AccountDeletedProps) =>
  `Your ${BRAND_NAME} account was deleted`

export default function AccountDeleted({
  name,
  purgeOn,
  tenantName,
  brandName,
}: AccountDeletedProps) {
  return (
    <EmailLayout
      preview={`Your ${BRAND_NAME} account was deleted`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Your account was deleted
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        You can no longer sign in, and every session has ended. Your personal
        details will be erased on {purgeOn}.
      </Text>
      <Text style={theme.small}>
        If you did not do this, contact support straight away.
      </Text>
    </EmailLayout>
  )
}

AccountDeleted.PreviewProps = {
  name: "Alice",
  purgeOn: "15 Nov 2026",
} satisfies AccountDeletedProps
