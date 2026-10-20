import { Button, Link, Text } from "@react-email/components"
import { theme } from "./theme"

// A call-to-action plus the plain link underneath, for clients that block
// buttons. Both use the same URL.
export function ActionButton({ href, label }: { href: string; label: string }) {
  return (
    <>
      <Button href={href} style={theme.button}>
        {label}
      </Button>
      <Text style={{ ...theme.small, marginTop: "16px" }}>
        Or paste this link into your browser:{" "}
        <Link href={href} style={theme.link}>
          {href}
        </Link>
      </Text>
    </>
  )
}
