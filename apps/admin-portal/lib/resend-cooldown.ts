import { RESEND_COOLDOWN_BACKOFF_SECONDS } from "@/constants/limits";

/** Seconds left until `until` (epoch ms); 0 once elapsed. Rounds up so 0.2s shows as 1. */
export function remainingSeconds(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** Cooldown length for the nth send (0-based), growing then capped. */
export function cooldownSecondsFor(sendCount: number): number {
  const steps = RESEND_COOLDOWN_BACKOFF_SECONDS;
  return steps[Math.min(Math.max(sendCount, 0), steps.length - 1)] ?? steps[steps.length - 1]!;
}

/** Epoch ms at which the next resend becomes available. */
export function cooldownEnd(now: number, sendCount: number): number {
  return now + cooldownSecondsFor(sendCount) * 1000;
}
