import * as crypto from "crypto";
import { PasswordService } from "@repo/security";
import { normalizePassword } from "./password-policy";

const DUMMY_PASSWORD_BYTES = 24;

let dummyHash: Promise<string> | undefined;

function getDummyHash(): Promise<string> {
  dummyHash ??= PasswordService.hash(
    crypto.randomBytes(DUMMY_PASSWORD_BYTES).toString("hex"),
  );
  return dummyHash;
}

/** Hashes the NFKC-normalised password with Argon2id. */
export function hashPassword(password: string): Promise<string> {
  return PasswordService.hash(normalizePassword(password));
}

/**
 * Verifies against the normalised form first, then the raw form so hashes
 * created before normalisation was introduced keep working.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const normalized = normalizePassword(password);
  if (await PasswordService.verify(hash, normalized)) return true;
  return normalized !== password && PasswordService.verify(hash, password);
}

/**
 * Spends the same time as a real verification so login latency does not
 * reveal whether the email (or a password on the account) exists. Always false.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  await PasswordService.verify(await getDummyHash(), normalizePassword(password));
  return false;
}
