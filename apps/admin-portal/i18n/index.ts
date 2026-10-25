import { en } from "./en";
import type { CopyPaths } from "./types";

export type CopyKey = CopyPaths<typeof en>;

export { en };
export { interpolate } from "./translate";
export { t, tk, useCopy } from "./use-copy";
