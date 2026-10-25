export type UriIssueKind = "invalid" | "insecure" | "duplicate";

export interface UriIssue {
  kind: UriIssueKind;
  uri: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** One URI per line; blanks and surrounding whitespace dropped. */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Plain http is acceptable only for loopback development hosts. */
export function isSecureOrLoopback(value: string): boolean {
  const url = new URL(value);
  return url.protocol === "https:" || LOOPBACK_HOSTS.has(url.hostname);
}

/** First problem per URI: not a URL, plain http on a public host, or a repeat. */
export function validateUriList(uris: readonly string[]): UriIssue[] {
  const seen = new Set<string>();
  const issues: UriIssue[] = [];
  for (const uri of uris) {
    if (!isHttpUrl(uri)) issues.push({ kind: "invalid", uri });
    else if (!isSecureOrLoopback(uri)) issues.push({ kind: "insecure", uri });
    else if (seen.has(uri)) issues.push({ kind: "duplicate", uri });
    seen.add(uri);
  }
  return issues;
}
