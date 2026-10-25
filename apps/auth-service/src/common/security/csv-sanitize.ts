/**
 * Neutralise spreadsheet formula injection: cells starting with = + - @ TAB or CR
 * are prefixed with a single quote so Excel/Sheets treat them as text.
 */
export function sanitizeCsvValue(value: unknown): string {
  const s = String(value ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Sanitise, escape embedded quotes and wrap a value as a quoted CSV cell. */
export function toCsvCell(value: unknown): string {
  return `"${sanitizeCsvValue(value).replace(/"/g, '""')}"`;
}
