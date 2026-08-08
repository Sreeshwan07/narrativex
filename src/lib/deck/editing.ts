import {
  DEFAULT_SLIDE_FORMAT,
  deckSchema,
  slideLayouts,
  type Deck,
  type DeckSlide,
  type SlideLayout,
} from "@/lib/deck/schema";

/** Layouts offered in the editor's layout picker (all supported by the renderer). */
export const EDITABLE_LAYOUTS: readonly SlideLayout[] = slideLayouts;

export function renumber(slides: DeckSlide[]): DeckSlide[] {
  return slides.map((slide, i) => ({ ...slide, number: i + 1 }));
}

function uid() {
  return `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function blankSlide(number: number): DeckSlide {
  return {
    id: uid(),
    number,
    layout: "statement",
    eyebrow: "Section",
    title: "New slide",
    subtitle: "",
    body: "Add your content here.",
    bullets: [],
    steps: [],
    tags: [],
    metrics: [],
    columns: [],
    phases: [],
    note: "",
    closing: "",
    format: { ...DEFAULT_SLIDE_FORMAT },
  };
}

export function addSlide(deck: Deck, at: number): Deck {
  const slides = [...deck.slides];
  slides.splice(at + 1, 0, blankSlide(at + 2));
  return { ...deck, slides: renumber(slides) };
}

export function duplicateSlide(deck: Deck, at: number): Deck {
  const source = deck.slides[at];
  if (!source) return deck;
  const copy: DeckSlide = structuredClone(source);
  copy.id = uid();
  const slides = [...deck.slides];
  slides.splice(at + 1, 0, copy);
  return { ...deck, slides: renumber(slides) };
}

export function deleteSlide(deck: Deck, at: number): Deck {
  if (deck.slides.length <= 1) return deck;
  const slides = deck.slides.filter((_, i) => i !== at);
  return { ...deck, slides: renumber(slides) };
}

export function moveSlide(deck: Deck, from: number, to: number): Deck {
  if (from === to || to < 0 || to >= deck.slides.length) return deck;
  const slides = [...deck.slides];
  const [moved] = slides.splice(from, 1);
  if (!moved) return deck;
  slides.splice(to, 0, moved);
  return { ...deck, slides: renumber(slides) };
}

export function updateSlide(deck: Deck, at: number, patch: Partial<DeckSlide>): Deck {
  const slides = deck.slides.map((slide, i) => (i === at ? { ...slide, ...patch } : slide));
  return { ...deck, slides };
}

/* ------------------------------------------------------------- persistence */

const STORAGE_KEY = "narrativex.deck.draft.v1";

/** Keeps the edited deck across a refresh. No account, no database. */
export function saveDraft(deck: Deck) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  } catch {
    /* quota or private mode — editing still works in memory */
  }
}

export function loadDraft(): Deck | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = deckSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
