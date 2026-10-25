import type { ScreenFamily } from "./types";

/** Typed copy-key builders: tsc fails when the catalogue lacks an entry. */
export function familyKey<F extends ScreenFamily, N extends "title" | "summary" | "purpose" | "persona" | "acc1" | "acc2" | "acc3">(
  family: F,
  name: N,
): `capabilities.${F}.${N}` {
  return `capabilities.${family}.${name}`;
}

export function sectionKey<F extends ScreenFamily, S extends string, N extends "heading" | "empty">(
  family: F,
  section: S,
  name: N,
): `capabilities.${F}.sections.${S}.${N}` {
  return `capabilities.${family}.sections.${section}.${name}`;
}

export function itemKey<F extends ScreenFamily, S extends string, G extends "cols" | "tiles" | "fields" | "actions", I extends string>(
  family: F,
  section: S,
  group: G,
  item: I,
): `capabilities.${F}.sections.${S}.${G}.${I}` {
  return `capabilities.${family}.sections.${section}.${group}.${item}`;
}
