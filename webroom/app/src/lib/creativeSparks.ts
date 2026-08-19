import type { PageDocument, PagePartId, TemplateId } from "./pageDocumentTypes";
import { TEMPLATE_PRESETS } from "./pageDocumentTheme";

export interface TemplateMood {
  id: TemplateId;
  label: string;
  tagline: string;
  accent: string;
  background: string;
}

export const TEMPLATE_MOODS: TemplateMood[] = [
  { id: "soft-web", label: "Soft Web", tagline: "Warm parchment, gentle serif", accent: "#e0526b", background: "#f6ecec" },
  { id: "pixel-tavern", label: "Pixel Tavern", tagline: "Retro dungeon, monospace glow", accent: "#c7314b", background: "#241b2e" },
  { id: "chrome-angel", label: "Chrome Angel", tagline: "Neon chrome, midnight glam", accent: "#ff4db8", background: "#160a23" },
  { id: "dark-zine", label: "Dark Zine", tagline: "Cut-and-paste, high contrast", accent: "#f1eaee", background: "#0e0e0e" },
  { id: "clean-portfolio", label: "Clean Portfolio", tagline: "Crisp, calm, maker-ready", accent: "#2563eb", background: "#ffffff" },
  { id: "start-simple", label: "Start Simple", tagline: "Blank canvas, your rules", accent: "#e0526b", background: "#f1ede9" },
];

const SHRINE_PROMPTS = [
  { title: "A band I never got over", body: "This corner is for the music that still lives in my head rent-free." },
  { title: "My favorite game", body: "Hours lost, stories found. Still thinking about the last boss." },
  { title: "A character I love", body: "Not official fan art — just feelings in text form." },
  { title: "A place that feels like home", body: "Even if I've only been there in pictures." },
  { title: "Something I'm making", body: "Work in progress. Messy, real, mine." },
];

const BADGE_PACKS: { emoji: string; label: string }[][] = [
  [
    { emoji: "✦", label: "night owl" },
    { emoji: "☕", label: "always sketching" },
    { emoji: "🌙", label: "soft punk" },
  ],
  [
    { emoji: "🎮", label: "pixel heart" },
    { emoji: "📼", label: "tape hoarder" },
    { emoji: "🕯️", label: "shrine keeper" },
  ],
  [
    { emoji: "🌿", label: "gentle web" },
    { emoji: "📓", label: "zine brain" },
    { emoji: "🔗", label: "link collector" },
  ],
];

const COLOR_PALETTES = [
  { accent: "#e0526b", background: "#f6ecec" },
  { accent: "#ff4db8", background: "#160a23" },
  { accent: "#7fbe95", background: "#0e0e0e" },
  { accent: "#2563eb", background: "#ffffff" },
  { accent: "#c7314b", background: "#241b2e" },
  { accent: "#f5a623", background: "#1a1420" },
  { accent: "#8b5cf6", background: "#dbeafe" },
  { accent: "#f1eaee", background: "#2d1b2e" },
];

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function ensurePart(parts: PagePartId[], part: PagePartId): PagePartId[] {
  return parts.includes(part) ? parts : [...parts, part];
}

export type CreativeSparkId =
  | "surprise-colors"
  | "add-shrine"
  | "sticker-pack"
  | "open-guestbook"
  | "pixel-doodle"
  | "shuffle-font";

export interface CreativeSpark {
  id: CreativeSparkId;
  label: string;
  hint: string;
}

export const CREATIVE_SPARKS: CreativeSpark[] = [
  { id: "surprise-colors", label: "Surprise me", hint: "Roll new accent and background colors" },
  { id: "add-shrine", label: "Add a shrine", hint: "A little altar for something you love" },
  { id: "sticker-pack", label: "Sticker pack", hint: "Three badges, one click" },
  { id: "open-guestbook", label: "Open guestbook", hint: "Let visitors leave a note" },
  { id: "pixel-doodle", label: "Pixel doodle", hint: "Start an 8×8 canvas" },
  { id: "shuffle-font", label: "Shuffle type", hint: "Cycle serif, sans, mono" },
];

export function applyCreativeSpark(id: CreativeSparkId, doc: PageDocument): PageDocument {
  switch (id) {
    case "surprise-colors": {
      const palette = randomItem(COLOR_PALETTES);
      return { ...doc, theme: { ...doc.theme, accent: palette.accent, background: palette.background } };
    }
    case "add-shrine": {
      const prompt = randomItem(SHRINE_PROMPTS);
      if (doc.shrines.length >= 5) return doc;
      return {
        ...doc,
        pageParts: ensurePart(doc.pageParts, "shrine"),
        shrines: [
          ...doc.shrines,
          {
            id: crypto.randomUUID(),
            title: prompt.title,
            body: prompt.body,
          },
        ],
      };
    }
    case "sticker-pack": {
      const pack = randomItem(BADGE_PACKS);
      const room = 20 - doc.badges.length;
      const toAdd = pack.slice(0, room);
      if (toAdd.length === 0) return doc;
      return {
        ...doc,
        pageParts: ensurePart(doc.pageParts, "badges"),
        badges: [
          ...doc.badges,
          ...toAdd.map((b) => ({ id: crypto.randomUUID(), emoji: b.emoji, label: b.label })),
        ],
      };
    }
    case "open-guestbook":
      return {
        ...doc,
        pageParts: ensurePart(doc.pageParts, "guestbook"),
        guestbook: { ...doc.guestbook, enabled: true, requireApproval: true },
      };
    case "pixel-doodle": {
      if (doc.pixelArt.length >= 10) return doc;
      const width = 8;
      const height = 8;
      return {
        ...doc,
        pageParts: ensurePart(doc.pageParts, "pixelArt"),
        pixelArt: [
          ...doc.pixelArt,
          {
            id: crypto.randomUUID(),
            title: "Doodle",
            width,
            height,
            pixels: Array(width * height).fill("transparent") as PageDocument["pixelArt"][0]["pixels"],
          },
        ],
      };
    }
    case "shuffle-font": {
      const order: PageDocument["theme"]["fontStyle"][] = ["sans", "serif", "mono"];
      const idx = order.indexOf(doc.theme.fontStyle);
      const next = order[(idx + 1) % order.length]!;
      return { ...doc, theme: { ...doc.theme, fontStyle: next } };
    }
    default:
      return doc;
  }
}

export function applyTemplateMood(doc: PageDocument, template: TemplateId): PageDocument {
  const preset = TEMPLATE_PRESETS[template];
  return {
    ...doc,
    theme: {
      ...doc.theme,
      template,
      accent: preset.accent,
      background: preset.background,
      fontStyle: preset.fontStyle,
    },
  };
}
