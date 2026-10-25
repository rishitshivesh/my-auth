/** Structural equality for JSON-like form state (order-insensitive for object keys). */
export function isSameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      isSameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

export function isDirty<T>(initial: T, current: T): boolean {
  return !isSameValue(initial, current);
}
