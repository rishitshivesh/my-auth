import type { CopyParams, CopyPaths, PlaceholderNames } from "./types";

type Catalogue = { readonly [key: string]: string | Catalogue };

type ValueAt<T, P extends string> = P extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? ValueAt<T[Head], Tail>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/** Params are required exactly when the template has placeholders. */
type ParamsFor<T, P extends string> =
  ValueAt<T, P> extends string
    ? [PlaceholderNames<ValueAt<T, P>>] extends [never]
      ? []
      : [params: Record<PlaceholderNames<ValueAt<T, P>>, string | number>]
    : [];

const PLACEHOLDER = /\{(\w+)\}/g;

/** Replace `{name}` placeholders; unknown placeholders are left visible. */
export function interpolate(template: string, params?: CopyParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function lookup(catalogue: Catalogue, key: string): string | undefined {
  let node: string | Catalogue | undefined = catalogue;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Build a typed translator over a catalogue. Keys are checked against the
 * catalogue shape and params against the template's placeholders. A missing
 * key (only possible via cast) returns the key itself so it is visible in QA.
 * The signature is deliberately close to next-intl's `t(key, values)`.
 */
export type Translate<T> = <P extends CopyPaths<T>>(key: P, ...args: ParamsFor<T, P>) => string;

export function createTranslator<const T extends Catalogue>(catalogue: T): Translate<T> {
  return function t<P extends CopyPaths<T>>(key: P, ...args: ParamsFor<T, P>): string {
    const template = lookup(catalogue, key);
    return template === undefined ? key : interpolate(template, args[0] as CopyParams | undefined);
  };
}
