import {
  MAGIC_LINK_POLL_BACKOFF_FACTOR,
  MAGIC_LINK_POLL_MAX_MS,
  MAGIC_LINK_POLL_START_MS,
} from "@/constants/limits";

/** Delay before poll number `attempt` (0-based): grows geometrically and is capped. */
export function nextPollDelay(attempt: number): number {
  const delay = MAGIC_LINK_POLL_START_MS * MAGIC_LINK_POLL_BACKOFF_FACTOR ** Math.max(0, attempt);
  return Math.min(Math.round(delay), MAGIC_LINK_POLL_MAX_MS);
}

/** Whole seconds left until the link/poll expires; never negative. */
export function secondsLeft(startedAt: number, ttlSeconds: number, now: number): number {
  return Math.max(0, Math.ceil((startedAt + ttlSeconds * 1000 - now) / 1000));
}

/** "123456" -> "123 456" for reading aloud; the value itself is untouched. */
export function groupMatchCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export type PollPhase =
  | { phase: "waiting" }
  | { phase: "expired" }
  | { phase: "used" }
  | { phase: "failed" };

/** Maps a poll error code to the phase that stops polling; unknown errors stop it too. */
export function pollFailurePhase(code: string | undefined): Exclude<PollPhase, { phase: "waiting" }> {
  if (code === "LINK_ALREADY_USED") return { phase: "used" };
  if (code === "LINK_EXPIRED") return { phase: "expired" };
  return { phase: "failed" };
}

/** Tokens like "Chrome on macOS" are already coarse; empty or missing means "unknown device". */
export function describeRequester(
  requestedFrom: { userAgent: string; ip: string } | null,
): { device: string; ip: string } | null {
  if (!requestedFrom) return null;
  const device = requestedFrom.userAgent.trim();
  const ip = requestedFrom.ip.trim();
  if (!device && !ip) return null;
  return { device, ip };
}
