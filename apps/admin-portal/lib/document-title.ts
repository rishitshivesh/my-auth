/** Brand shown after the page heading in the browser tab. */
export const PRODUCT_NAME = "Scrolloop Sentry";
const SEPARATOR = " · ";

/** "Roles · Scrolloop Sentry"; the bare product name when the page has no heading yet. */
export function titleFromHeading(heading: string | null | undefined): string {
  const text = (heading ?? "").replace(/\s+/g, " ").trim();
  return text ? `${text}${SEPARATOR}${PRODUCT_NAME}` : PRODUCT_NAME;
}
