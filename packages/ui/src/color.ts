/**
 * The theme's colour (docs/INTERFAZ.md §1.4): one accent chosen by the user
 * replaces the corporate blue. Every blue of the app, and the frame of the
 * app's icon, is moved from the corporate blue to the accent in OKLCH: the
 * hue turns by the same angle, the chroma scales by the same factor and the
 * lightness moves by the same amount (in proportion to how coloured each one
 * is, so white and grey stay as they are). Pure, no DOM: the Electron main
 * process recolours the icon with it too.
 */

/** The corporate blue: the default accent. */
export const DEFAULT_ACCENT = "#2f7dff";

export type Rgb = [number, number, number];

/** "#rgb" / "#rrggbb" (any case) → normalised "#rrggbb", or null. */
export function normHex(v: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  return `#${h.toLowerCase()}`;
}

export function hexToRgb(hex: string): Rgb {
  const h = (normHex(hex) ?? DEFAULT_ACCENT).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

const toLin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLin = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055);

/** sRGB 0–255 → OKLCH [L 0–1, C, H radians]. */
export function rgbToOklch([r, g, b]: Rgb): Rgb {
  const lr = toLin(r), lg = toLin(g), lb = toLin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

/** OKLCH → sRGB 0–255 (clipped to the screen's gamut). */
export function oklchToRgb([L, C, H]: Rgb): Rgb {
  const A = C * Math.cos(H), B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ].map((v) => Math.max(0, Math.min(255, v))) as Rgb;
}

/** Moves colours from the corporate blue to `accent`; build once, apply to many. */
export function accentShift(accent: string): (rgb: Rgb) => Rgb {
  const [Lb, Cb, Hb] = rgbToOklch(hexToRgb(DEFAULT_ACCENT));
  const [Lt, Ct, Ht] = rgbToOklch(hexToRgb(accent));
  const dL = Lt - Lb, kC = Ct / Cb, dH = Ht - Hb;
  return (rgb) => {
    const [L, C, H] = rgbToOklch(rgb);
    // How coloured it is (white, grey and black: 0, they don't move).
    const w = Math.min(1, C / Cb);
    return oklchToRgb([Math.max(0, Math.min(1, L + dL * w)), C * kC, H + dH]);
  };
}

/** The brand blues of tokens.css, as they are with the corporate blue. */
const BRAND = {
  "--brand-300": "#6cb6ff",
  "--brand-500": DEFAULT_ACCENT,
  "--brand-700": "#1648d8",
  "--primary-hover": "#4a8fff",
} as const;

/**
 * The CSS variables that take the accent (tokens.css); empty for the
 * corporate blue, so tokens.css stays as it is.
 */
export function accentVars(accent: string | null): Record<string, string> {
  const hex = accent ? normHex(accent) : null;
  if (!hex || hex === DEFAULT_ACCENT) return {};
  const shift = accentShift(hex);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(BRAND)) out[k] = rgbToHex(shift(hexToRgb(v)));
  // The main one is exactly the accent.
  out["--brand-500"] = hex;
  for (const k of ["--brand-300", "--brand-500", "--brand-700"]) out[`${k}-rgb`] = hexToRgb(out[k]!).join(" ");
  const main = hexToRgb(hex).join(" ");
  out["--accent"] = hex;
  out["--accent-soft"] = `rgb(${main} / .14)`;
  out["--primary-soft"] = `rgb(${main} / .15)`;
  return out;
}

/** Hue 0–360, saturation and value 0–1 (the colour picker's square and slider). */
export type Hsv = [number, number, number];

export function rgbToHsv([r, g, b]: Rgb): Hsv {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), d = max - Math.min(R, G, B);
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

export function hsvToRgb([h, s, v]: Hsv): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

/** Contrast of white on this colour (WCAG: 4.5 reads well as text, 3 as big text and icons). */
export function contrastWithWhite(hex: string): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05);
}
