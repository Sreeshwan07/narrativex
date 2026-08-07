import { z } from "zod";

/**
 * Deterministic slide model. The AI never produces layout — it produces pitch
 * data, and the application maps that data into these predefined templates.
 */
export const slideLayouts = [
  "cover",
  "statement",
  "flow",
  "features",
  "market",
  "model",
  "technology",
  "advantage",
  "roadmap",
] as const;

export type SlideLayout = (typeof slideLayouts)[number];

export const deckBulletSchema = z.object({
  label: z.string(),
  detail: z.string().default(""),
});

export const deckSlideSchema = z.object({
  id: z.string(),
  /** 1-based position in the deck. */
  number: z.number(),
  layout: z.enum(slideLayouts),
  eyebrow: z.string(),
  title: z.string(),
  subtitle: z.string().default(""),
  body: z.string().default(""),
  bullets: z.array(deckBulletSchema).default([]),
  steps: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  /** Honest disclosure shown when the source documentation lacked evidence. */
  note: z.string().default(""),
  closing: z.string().default(""),
});

export type DeckBullet = z.infer<typeof deckBulletSchema>;
export type DeckSlide = z.infer<typeof deckSlideSchema>;

export const deckSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  generatedAt: z.string(),
  slides: z.array(deckSlideSchema),
});

export type Deck = z.infer<typeof deckSchema>;

export type GenerateDeckResult =
  | { success: true; deck: Deck }
  | { success: false; error: string };

export const DECK_SIZE = { width: 1280, height: 720 } as const;

export const NO_MARKET_DATA_NOTE = "Market sizing not provided in source documentation.";
