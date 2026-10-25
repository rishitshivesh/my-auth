/** Leaf-path helper: "auth.linkLanding.expired.title" for every string leaf. */
export type CopyPaths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : CopyPaths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type CopyParams = Record<string, string | number>;

/** Extract `{name}` placeholders from a template literal type. */
export type PlaceholderNames<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}` ? Name | PlaceholderNames<Rest> : never;
