export type EnrollStep = "intro" | "setup" | "recovery" | "done";

export const ENROLL_STEPS: readonly EnrollStep[] = ["intro", "setup", "recovery", "done"];

/** Backup codes are shown once; group for readability without altering the value. */
export function formatRecoveryCode(code: string): string {
  const clean = code.replace(/\s|-/g, "");
  return clean.length === 10 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : code;
}

export function manualKeyGroups(secret: string): string {
  return secret.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}
