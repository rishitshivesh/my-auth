const UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 31_536_000_000 },
  { unit: "month", ms: 2_592_000_000 },
  { unit: "day", ms: 86_400_000 },
  { unit: "hour", ms: 3_600_000 },
  { unit: "minute", ms: 60_000 },
];

/** "3 hours ago" style text; `null` when the timestamp is missing or invalid. */
export function formatRelative(iso: string | null | undefined, now: number = Date.now(), locale = "en"): string | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  const delta = time - now;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const match = UNITS.find(({ ms }) => Math.abs(delta) >= ms);
  if (!match) return formatter.format(0, "minute");
  return formatter.format(Math.round(delta / match.ms), match.unit);
}

export function formatDate(iso: string | null | undefined, locale = "en"): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(locale, { dateStyle: "medium" });
}
