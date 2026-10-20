// Brand constants for every email. No remote images: the wordmark is text, so
// nothing is blocked by clients that hide external pictures.
export const BRAND_NAME = "Scrolloop Sentry"

export const WORDMARK = { primary: "scrolloop", secondary: "sentry" } as const

export const COLORS = {
  bg: "#F7F6F4",
  card: "#FFFFFF",
  border: "#ECEAE6",
  textPrimary: "#1A1916",
  textSecondary: "#4A4845",
  textTertiary: "#8A8784",
  accent: "#2ABF6C",
  accentDark: "#1D8F50",
  accentSoft: "#E8F7EE",
  onAccent: "#0B2B18",
} as const

export const FONT_STACK =
  '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

export const MONO_STACK =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
