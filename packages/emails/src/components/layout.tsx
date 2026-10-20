import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"
import { BRAND_NAME, WORDMARK } from "../brand"
import { theme } from "./theme"

interface EmailLayoutProps {
  // Shown by inbox lists next to the subject.
  preview: string
  // Shown as a small badge in the header when the mail concerns one tenant.
  tenantName?: string
  // Replaces the "scrolloop" half of the wordmark for white-labelled tenants.
  brandName?: string
  children: ReactNode
}

// The shell every email shares: wordmark header, content card, footer.
export function EmailLayout({
  preview,
  tenantName,
  brandName,
  children,
}: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={theme.body}>
        <Container style={theme.container}>
          <Row style={theme.brandRow}>
            <Column>
              <Text style={theme.brandName}>
                {brandName ? (
                  brandName
                ) : (
                  <>
                    {WORDMARK.primary}{" "}
                    <span style={theme.brandSecondary}>
                      {WORDMARK.secondary}
                    </span>
                  </>
                )}
              </Text>
            </Column>
            {tenantName ? (
              <Column align="right">
                <Text style={theme.tenantBadge}>{tenantName}</Text>
              </Column>
            ) : null}
          </Row>
          <Section style={theme.card}>{children}</Section>
          <Text style={theme.footer}>
            You are receiving this because of activity on your {BRAND_NAME}{" "}
            account. If this was not you, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
