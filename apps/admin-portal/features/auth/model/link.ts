import type { LinkLandingStatus } from "@repo/ui";
import { linkStatusFromErrorCode } from "@/lib/link-status";

/** Redemption state of an emailed link. The token is only consumed after `redeeming`. */
export type LinkPhase =
  | { phase: "valid" }
  | { phase: "redeeming" }
  | { phase: "done" }
  | { phase: "failed"; status: Extract<LinkLandingStatus, "expired" | "used" | "invalid" | "wrong-account"> };

export function failedPhase(code: string | undefined): LinkPhase {
  return { phase: "failed", status: linkStatusFromErrorCode(code) };
}

export function landingStatus(state: LinkPhase, hasToken: boolean): LinkLandingStatus {
  if (!hasToken) return "invalid";
  switch (state.phase) {
    case "valid":
      return "valid";
    case "redeeming":
      return "pending";
    case "done":
      return "valid";
    case "failed":
      return state.status;
  }
}

/** Mail tokens are opaque; reject obviously malformed ones before any request. */
export function isPlausibleToken(token: string | null | undefined): token is string {
  return typeof token === "string" && token.length >= 8 && token.length <= 512 && /^[\w.~-]+$/.test(token);
}

export type LinkTarget = "redeem" | "request" | "login" | "home";

/** What each landing button does per state. The token is only spent by "redeem". */
export function linkTarget(status: LinkLandingStatus, side: "primary" | "secondary"): LinkTarget {
  const table: Record<LinkLandingStatus, readonly [LinkTarget, LinkTarget]> = {
    loading: ["login", "login"],
    pending: ["login", "login"],
    valid: ["redeem", "login"],
    expired: ["request", "login"],
    used: ["login", "request"],
    invalid: ["login", "request"],
    "wrong-account": ["login", "home"],
  };
  return table[status][side === "primary" ? 0 : 1];
}
