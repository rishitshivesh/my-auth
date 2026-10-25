import type { AuthOutcome } from "@scrolloop/sdk";
import { type Destination, type DestinationContext, resolveDestination } from "./destination";

/** Where an AuthOutcome sends the user next. Every branch of the SDK union is handled. */
export type Continuation =
  | { kind: "session"; tenantSlug: string; destination: Destination }
  | { kind: "mfa"; tempToken: string; methods: readonly string[]; preferred?: string; remainingAttempts?: number }
  | { kind: "enroll"; enrollmentToken?: string };

export function defaultDashboard(tenantSlug: string): string {
  return `/t/${encodeURIComponent(tenantSlug)}/dashboard`;
}

export function classifyOutcome(
  outcome: AuthOutcome,
  next: string | null | undefined,
  fallbackSlug: string,
  ctx: DestinationContext,
): Continuation {
  if (outcome.mfaRequired === true) {
    const challenge = outcome.mfaChallenge;
    return {
      kind: "mfa",
      tempToken: challenge.tempToken,
      methods: challenge.methods,
      preferred: challenge.preferredMethod,
      remainingAttempts: challenge.remainingAttempts,
    };
  }
  if (outcome.status === "mfa_enrollment_required") {
    return { kind: "enroll", enrollmentToken: outcome.enrollmentToken };
  }
  const tenantSlug = outcome.tenantSlug || fallbackSlug;
  const destination =
    resolveDestination(next, ctx) ?? { href: defaultDashboard(tenantSlug), isExternal: false };
  return { kind: "session", tenantSlug, destination };
}
