export type HeaderWeight = "regular" | "bold";
export type BackgroundStyle = "solid" | "gradient";

export interface Branding {
  primaryColor: string;
  logoUrl?: string;
  fontFamily: string;
  headerWeight: HeaderWeight;
  backgroundStyle: BackgroundStyle;
}

/** Mirrors the backend FONT_FAMILY_ALLOWLIST (tenant-branding DTO). */
export const BRANDING_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Montserrat", "Nunito", "Source Sans Pro", "Raleway", "Ubuntu", "system-ui",
] as const;

export const LOGO_MAX_BYTES = 500 * 1024;
export const LOGO_TYPES = ["image/png", "image/svg+xml", "image/jpeg"] as const;
const HEX = /^#[0-9A-Fa-f]{6}$/;
/** WCAG 2.2 AA for normal text. */
export const MIN_CONTRAST = 4.5;
const LIGHT_SURFACE = "#FFFFFF";
const DARK_SURFACE = "#121212";

export type LogoError = "type" | "size";

export function isValidHex(value: string): boolean {
  return HEX.test(value);
}

export function validateLogo(file: { type: string; size: number }): LogoError | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > LOGO_MAX_BYTES) return "size";
  return null;
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastReport {
  light: number;
  dark: number;
  lightOk: boolean;
  darkOk: boolean;
}

/** Contrast of the brand colour as text/controls against the light and dark surfaces. */
export function brandContrast(primaryColor: string): ContrastReport | null {
  if (!isValidHex(primaryColor)) return null;
  const light = contrastRatio(primaryColor, LIGHT_SURFACE);
  const dark = contrastRatio(primaryColor, DARK_SURFACE);
  return { light, dark, lightOk: light >= MIN_CONTRAST, darkOk: dark >= MIN_CONTRAST };
}

export function isDirty(saved: Branding, draft: Branding): boolean {
  return (
    saved.primaryColor.toLowerCase() !== draft.primaryColor.toLowerCase() ||
    saved.fontFamily !== draft.fontFamily ||
    saved.headerWeight !== draft.headerWeight ||
    saved.backgroundStyle !== draft.backgroundStyle
  );
}

/** Body for PUT: logo is changed only by the upload endpoint, never echoed back. */
export function brandingPayload(draft: Branding): Omit<Branding, "logoUrl"> {
  return {
    primaryColor: draft.primaryColor,
    fontFamily: draft.fontFamily,
    headerWeight: draft.headerWeight,
    backgroundStyle: draft.backgroundStyle,
  };
}
