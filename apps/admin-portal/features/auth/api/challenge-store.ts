import { isChallengeLive, parseChallenge, type StoredChallenge } from "../model/challenge";

const KEY = "sentry:mfa-challenge";

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** sessionStorage only (tab-scoped, short TTL): the temp token never reaches the URL. */
export function saveChallenge(challenge: StoredChallenge): void {
  try {
    store()?.setItem(KEY, JSON.stringify(challenge));
  } catch {
    // Storage blocked: the challenge simply cannot survive navigation; /u/mfa then restarts sign-in.
  }
}

export function loadChallenge(now: number = Date.now()): StoredChallenge | null {
  const parsed = parseChallenge(store()?.getItem(KEY) ?? null);
  if (isChallengeLive(parsed, now)) return parsed;
  clearChallenge();
  return null;
}

export function clearChallenge(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
