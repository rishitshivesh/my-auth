const LABELS: Readonly<Record<string, string>> = {
  google: "Google",
  github: "GitHub",
  microsoft: "Microsoft",
};

/** Brand names are proper nouns, not translatable copy. Unknown providers show their id. */
export function providerLabel(provider: string): string {
  return LABELS[provider] ?? provider;
}
