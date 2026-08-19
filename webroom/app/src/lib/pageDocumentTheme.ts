import type { PageDocument, TemplateId } from "./pageDocumentTypes";

export const TEMPLATE_PRESETS: Record<
  TemplateId,
  { accent: string; background: string; fontStyle: PageDocument["theme"]["fontStyle"] }
> = {
  "soft-web": { accent: "#e0526b", background: "#f6ecec", fontStyle: "serif" },
  "pixel-tavern": { accent: "#c7314b", background: "#241b2e", fontStyle: "mono" },
  "chrome-angel": { accent: "#ff4db8", background: "#160a23", fontStyle: "sans" },
  "dark-zine": { accent: "#f1eaee", background: "#0e0e0e", fontStyle: "serif" },
  "clean-portfolio": { accent: "#2563eb", background: "#ffffff", fontStyle: "sans" },
  "start-simple": { accent: "#e0526b", background: "#f1ede9", fontStyle: "sans" },
};

export function contrastRatio(foreground: string, background: string): number {
  const lum = (hex: string) => {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const l1 = lum(foreground);
  const l2 = lum(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getContrastWarnings(document: PageDocument): string[] {
  if (!document.access.contrastWarningsEnabled) return [];
  const warnings: string[] = [];
  const ratio = contrastRatio(document.theme.accent, document.theme.background);
  if (ratio < 4.5) {
    warnings.push(
      `Accent and background contrast is ${ratio.toFixed(1)}:1 — aim for at least 4.5:1 for readable links and headings.`,
    );
  }
  for (const item of document.gallery) {
    if (!item.alt.trim()) warnings.push(`Gallery image "${item.url}" is missing alt text.`);
  }
  return warnings;
}
