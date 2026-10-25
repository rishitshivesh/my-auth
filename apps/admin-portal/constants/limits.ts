/** Limits, cooldowns and sizes. No magic numbers elsewhere in the portal. */

export const OTP_LENGTH = 6;
export const RECOVERY_CODE_LENGTH = 10;

export const RESEND_COOLDOWN_SECONDS = 30;
/** Cooldown grows after repeated resends to discourage mail flooding. */
export const RESEND_COOLDOWN_BACKOFF_SECONDS = [30, 60, 120] as const;

export const SEARCH_DEBOUNCE_MS = 300;
export const COPY_FEEDBACK_MS = 2000;

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

/** How long a sign-in counts as "recent" for sensitive actions. */
export const RECENT_AUTH_WINDOW_MS = 5 * 60_000;
export const RECENT_AUTH_INTENT_TTL_MS = 10 * 60_000;

export const SECRET_AUTO_HIDE_MS = 60_000;
export const DEFAULT_STALE_TIME_MS = 30_000;

/** Personal account forms. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PROFILE_NAME_MAX_LENGTH = 100;
export const PROFILE_PHONE_MAX_LENGTH = 32;
export const PASSKEY_NAME_MAX_LENGTH = 100;
export const SECURITY_EVENTS_PAGE_SIZE = 25;
export const SECURITY_EVENTS_MAX = 100;
export const RECOVERY_CODES_LOW_THRESHOLD = 3;

/** Cross-device magic link: polling cadence and the server-side wrong-code budget (void after this many). */
export const MAGIC_LINK_POLL_START_MS = 2_000;
export const MAGIC_LINK_POLL_MAX_MS = 8_000;
export const MAGIC_LINK_POLL_BACKOFF_FACTOR = 1.5;
export const MAGIC_LINK_MATCH_MAX_ATTEMPTS = 5;
export const MAGIC_LINK_DEFAULT_TTL_SECONDS = 600;
export const MATCH_CODE_LENGTH = 6;
/** Password-reset link tokens and the redirect-validation cutoff for server-supplied destinations. */
export const MAX_REDIRECT_URI_LENGTH = 2048;
