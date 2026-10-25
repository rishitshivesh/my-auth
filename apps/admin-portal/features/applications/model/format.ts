/** Locale-aware date for table cells; `fallback` covers null/invalid values. */
export function formatDate(iso: string | null | undefined, fallback: string, locale?: string): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
