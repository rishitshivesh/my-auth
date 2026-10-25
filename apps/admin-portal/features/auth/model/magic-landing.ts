import type { MagicLinkPreview } from "@scrolloop/sdk";
import { MAGIC_LINK_MATCH_MAX_ATTEMPTS } from "@/constants/limits";
import { linkStatusFromErrorCode } from "@/lib/link-status";

export type LandingFailure = ReturnType<typeof linkStatusFromErrorCode>;

/** State of the emailed-link confirmation screen. The link is only spent by an explicit action. */
export type MagicLanding =
  | { phase: "previewing" }
  | { phase: "ready"; preview: MagicLinkPreview; attempts: number; codeError: boolean; entering: boolean }
  | { phase: "working"; preview: MagicLinkPreview; attempts: number; entering: boolean }
  | { phase: "approved" }
  | { phase: "locked" }
  | { phase: "failed"; status: LandingFailure };

export const failedLanding = (code: string | undefined): MagicLanding => ({
  phase: "failed",
  status: linkStatusFromErrorCode(code),
});

export function afterWrongCode(
  state: Extract<MagicLanding, { phase: "working" }>,
): MagicLanding {
  const attempts = state.attempts + 1;
  if (attempts >= MAGIC_LINK_MATCH_MAX_ATTEMPTS) return { phase: "locked" };
  return { phase: "ready", preview: state.preview, attempts, codeError: true, entering: true };
}

export const attemptsLeft = (attempts: number): number => Math.max(0, MAGIC_LINK_MATCH_MAX_ATTEMPTS - attempts);
