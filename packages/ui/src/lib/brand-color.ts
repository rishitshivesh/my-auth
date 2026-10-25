const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Accept only #rgb / #rrggbb so tenant-supplied colour can never inject CSS. */
export function sanitizeBrandColor(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return HEX.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

function expand(hex: string): [number, number, number] {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = expand(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const WCAG_AA_NORMAL = 4.5;
const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#1a1a1a";

/**
 * Pick readable text for a brand-coloured surface, or undefined when neither
 * white nor near-black reaches WCAG AA (caller then falls back to the theme accent).
 */
export function readableTextOn(background: string): string | undefined {
  const best = contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
  return contrastRatio(background, best) >= WCAG_AA_NORMAL ? best : undefined;
}

/** CSS variable overrides for a validated brand colour; empty when unusable. */
export function brandStyle(color: string | null | undefined): Record<string, string> {
  const safe = sanitizeBrandColor(color);
  const text = safe ? readableTextOn(safe) : undefined;
  if (!safe || !text) return {};
  return { "--accent": safe, "--accent-foreground": text };
}
