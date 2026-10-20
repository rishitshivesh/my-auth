import { Text } from "@react-email/components"
import { theme } from "./theme"

// Small request id on security alerts so a user can quote it to support.
export function Reference({ requestId }: { requestId?: string }) {
  if (!requestId) return null
  return <Text style={theme.reference}>Reference: {requestId}</Text>
}
