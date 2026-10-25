import type { LinkLandingStatus } from "@repo/ui";

/**
 * Map a redemption failure to the landing state. Unknown codes are "invalid"
 * on purpose: never reveal more than the API policy allows.
 */
export function linkStatusFromErrorCode(code: string | undefined): Extract<LinkLandingStatus, "expired" | "used" | "invalid" | "wrong-account"> {
  switch (code) {
    case "AUTH_TOKEN_EXPIRED":
      return "expired";
    case "AUTH_TOKEN_USED":
    case "RESOURCE_CONFLICT":
      return "used";
    case "TENANT_MISMATCH":
    case "ACCESS_FORBIDDEN":
      return "wrong-account";
    default:
      return "invalid";
  }
}

export const LINK_STATUS_COPY_KEY = {
  loading: "auth.linkLanding.loading",
  pending: "auth.linkLanding.pending",
  valid: "auth.linkLanding.valid",
  expired: "auth.linkLanding.expired",
  used: "auth.linkLanding.used",
  invalid: "auth.linkLanding.invalid",
  "wrong-account": "auth.linkLanding.wrongAccount",
} as const satisfies Record<LinkLandingStatus, string>;
