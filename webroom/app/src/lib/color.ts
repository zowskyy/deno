// WCAG relative luminance, used to pick a text color that's actually
// readable against a user-chosen theme background — this is the fix for
// a real bug found by hand-testing: page text was inheriting the SITE's
// light/dark-mode color, not a color derived from the PAGE's own theme
// background, so a dark theme on a light-mode browser rendered
// near-invisible near-black-on-near-black text.
function relativeLuminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export interface ReadableText {
  ink: string;
  inkSoft: string;
}

/** Picks a WCAG-legible text color pair (primary + de-emphasized) for a given background hex color. */
export function readableTextFor(backgroundHex: string): ReadableText {
  const luminance = relativeLuminance(backgroundHex);
  const isDark = luminance < 0.5;
  return isDark
    ? { ink: "rgba(255,255,255,0.96)", inkSoft: "rgba(255,255,255,0.72)" }
    : { ink: "rgba(20,14,26,0.94)", inkSoft: "rgba(20,14,26,0.65)" };
}
