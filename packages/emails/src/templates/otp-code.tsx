import { Heading, Text } from "@react-email/components"
import { BRAND_NAME } from "../brand"
import { EmailLayout } from "../components/layout"
import { theme } from "../components/theme"
import type { OtpCodeProps } from "../types"

export const subject = ({ code }: OtpCodeProps) =>
  `${code} is your ${BRAND_NAME} code`

export default function OtpCode({
  name,
  code,
  expiresInMinutes,
  tenantName,
  brandName,
}: OtpCodeProps) {
  return (
    <EmailLayout
      preview={`Your ${BRAND_NAME} code is ${code}`}
      tenantName={tenantName}
      brandName={brandName}
    >
      <Heading as="h1" style={theme.heading}>
        Your one-time code
      </Heading>
      <Text style={theme.text}>Hi {name},</Text>
      <Text style={theme.text}>
        Enter this code to continue. It expires in {expiresInMinutes} minutes.
      </Text>
      <Text style={theme.code}>{code}</Text>
      <Text style={theme.small}>
        Never share this code. {BRAND_NAME} will never ask you for it by phone
        or chat.
      </Text>
    </EmailLayout>
  )
}

OtpCode.PreviewProps = {
  name: "Alice",
  code: "482913",
  expiresInMinutes: 10,
} satisfies OtpCodeProps
