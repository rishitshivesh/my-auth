import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";

/**
 * Signed, browser-bound OAuth `state` for social login (RFC 6749 10.12).
 *
 * state = base64url(JSON{...payload, n: nonce, exp}) + "." + HMAC-SHA256
 * The same nonce is set in an httpOnly cookie when the flow starts and must
 * match on the callback, so a callback URL minted by an attacker's browser is
 * refused in the victim's browser (login CSRF). The cookie is cleared on first
 * use, which makes the state single-use per browser. SameSite=Lax is required:
 * the provider redirects back via a cross-site top-level navigation.
 */
export const SOCIAL_STATE_COOKIE = "social_state_nonce";
export const SOCIAL_STATE_TTL_MS = 10 * 60 * 1000;

export type SocialStatePayload = Record<string, string>;

function key(): Buffer {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET is required");
  return createHmac("sha256", secret).update("social-state:v1").digest();
}

function mac(body: string): Buffer {
  return createHmac("sha256", key()).update(body).digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieOptions(): { httpOnly: boolean; secure: boolean; sameSite: "lax"; path: string } {
  return {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/auth/social",
  };
}

/** Creates the signed state and sets the browser-binding nonce cookie. */
export function issueSocialState(res: Response, payload: SocialStatePayload): string {
  const nonce = randomBytes(16).toString("base64url");
  res.cookie(SOCIAL_STATE_COOKIE, nonce, { ...cookieOptions(), maxAge: SOCIAL_STATE_TTL_MS });
  const body = Buffer.from(
    JSON.stringify({ ...payload, n: nonce, exp: Date.now() + SOCIAL_STATE_TTL_MS }),
  ).toString("base64url");
  return `${body}.${mac(body).toString("base64url")}`;
}

/** Verifies signature, expiry and browser binding; clears the cookie (single use). Null when invalid. */
export function consumeSocialState(
  req: Request,
  res: Response,
  raw: unknown,
): SocialStatePayload | null {
  const cookieNonce: unknown = req.cookies?.[SOCIAL_STATE_COOKIE];
  const { maxAge: _maxAge, ...clearOpts } = { maxAge: 0, ...cookieOptions() };
  res.clearCookie(SOCIAL_STATE_COOKIE, clearOpts);
  if (typeof raw !== "string" || typeof cookieNonce !== "string") return null;
  const [body, sig, extra] = raw.split(".");
  if (!body || !sig || extra !== undefined) return null;
  if (!safeEqual(Buffer.from(sig, "base64url"), mac(body))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
    const { n, exp, ...rest } = parsed;
    if (typeof n !== "string" || typeof exp !== "number" || exp < Date.now()) return null;
    if (!safeEqual(Buffer.from(n), Buffer.from(cookieNonce))) return null;
    const payload: SocialStatePayload = {};
    for (const [k, v] of Object.entries(rest)) {
      if (typeof v === "string") payload[k] = v;
    }
    return payload;
  } catch {
    return null;
  }
}
