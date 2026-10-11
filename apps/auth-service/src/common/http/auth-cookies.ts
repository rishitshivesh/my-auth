import type { CookieOptions, Response } from "express";

/**
 * Single definition of every authentication cookie the service sets.
 *
 * Cookie attributes were previously defined inline in four controllers and
 * had drifted (SameSite=lax on the bootstrap path vs strict elsewhere; domain
 * honoured on some paths only). Change cookie policy here, nowhere else.
 */

export const ACCESS_TOKEN_COOKIE = "accessToken";
export const REFRESH_TOKEN_COOKIE = "refreshToken";
export const MFA_ENROLLMENT_COOKIE = "mfa_enrollment_token";

/** Matches the RS256 access-token TTL. */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
/** Matches the refresh-token TTL issued by OAuthRefreshTokenService. */
export const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MFA_ENROLLMENT_MAX_AGE_MS = 5 * 60 * 1000;

function baseOptions(): CookieOptions {
  const domain = process.env["COOKIE_DOMAIN"] || undefined;
  return {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "strict",
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

export function setAccessTokenCookie(res: Response, accessToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...baseOptions(),
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
}

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...baseOptions(),
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken);
}

/** Attributes must match the ones used when setting, or browsers keep the cookie. */
export function clearAuthCookies(res: Response): void {
  const { maxAge: _maxAge, ...options } = baseOptions();
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
}

export function setMfaEnrollmentCookie(res: Response, enrollmentToken: string): void {
  const { domain: _domain, ...options } = baseOptions();
  res.cookie(MFA_ENROLLMENT_COOKIE, enrollmentToken, {
    ...options,
    path: "/mfa/enroll",
    maxAge: MFA_ENROLLMENT_MAX_AGE_MS,
  });
}
