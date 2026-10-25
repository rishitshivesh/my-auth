const KEY_BYTES = 16;

/**
 * Random hex key (32 characters). Uses getRandomValues, which unlike crypto.randomUUID is also
 * available on plain-http hosts (local and staging setups).
 */
export function randomKey(bytes: number = KEY_BYTES): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
