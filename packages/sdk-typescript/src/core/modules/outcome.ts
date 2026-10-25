/**
 * Maps the many shapes a sign-in endpoint can answer with onto AuthOutcome.
 * Used by password login, magic-link verify, passkey login and MFA completion
 * so every flow preserves the same result branches.
 */

import type { AuthOutcome, MfaMethod, SessionEstablished } from "../api-types";
import type { SessionClaims } from "../types";
import type { ModuleContext } from "./context";

type Rec = Record<string, unknown>;

const asString = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function asMethods(v: unknown): MfaMethod[] {
  if (!Array.isArray(v)) return [];
  return v.filter((m): m is MfaMethod => typeof m === "string") as MfaMethod[];
}

function parseSession(payload: Rec): SessionEstablished["session"] {
  const s = payload.session;
  return typeof s === "object" && s !== null ? (s as SessionClaims) : undefined;
}

export function parseAuthOutcome(ctx: ModuleContext, payload: Rec): AuthOutcome {
  if (payload.mfaRequired === true) {
    ctx.log("MFA required");
    return {
      mfaRequired: true,
      mfaChallenge: {
        tempToken: asString(payload.tempToken) ?? "",
        methods: asMethods(payload.availableMethods),
        preferredMethod: asString(payload.preferredMethod),
      },
    };
  }

  if (payload.status === "mfa_enrollment_required") {
    ctx.log("MFA enrollment required");
    return {
      status: "mfa_enrollment_required",
      enrollmentToken: asString(payload.enrollmentToken),
    };
  }

  const expiresIn = typeof payload.expiresIn === "number" ? payload.expiresIn : 0;
  const session = parseSession(payload);
  ctx.sessionEstablished(expiresIn, session);

  const result: SessionEstablished = {
    expiresIn,
    tenantSlug: asString(payload.tenantSlug) ?? session?.tenantSlug ?? "",
    session,
    user: payload.user as SessionEstablished["user"],
    warning: asString(payload.warning),
  };
  return result;
}

/** For endpoints (MFA completion) that can only answer with a session. */
export function parseSessionOutcome(ctx: ModuleContext, payload: Rec): SessionEstablished {
  const outcome = parseAuthOutcome(ctx, payload);
  if (outcome.mfaRequired === true || outcome.status === "mfa_enrollment_required") {
    // The server never answers a completed challenge with another challenge;
    // treat it as a protocol error rather than pretending a session exists.
    throw new Error("Unexpected non-session response while completing MFA");
  }
  return outcome;
}
