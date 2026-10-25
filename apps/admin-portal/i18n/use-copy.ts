import { en } from "./en";
import { createTranslator, interpolate, lookup, type Translate } from "./translate";
import type { CopyKey } from "./index";

/**
 * Typed translator for the active locale. Only `en` ships today; adopting
 * next-intl later means swapping this module's internals while keeping
 * `t(key, params)` and `useCopy()` call sites unchanged.
 */
export const t: Translate<typeof en> = createTranslator(en);

/**
 * Translator for keys only known at runtime (nav entries, capability ids).
 * The key is still checked against the catalogue; params are not, because the
 * placeholders of a key union cannot be known statically.
 */
export function tk(key: CopyKey, params?: Record<string, string | number>): string {
  const template = lookup(en, key);
  return template === undefined ? key : interpolate(template, params);
}

/** Hook form of `t()`: a stable translator (locale context can slot in here). */
export function useCopy() {
  return { t, tk };
}
