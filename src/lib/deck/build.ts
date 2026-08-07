import type { Pitch } from "@/lib/pitch/schema";
import {
  NO_MARKET_DATA_NOTE,
  type Deck,
  type DeckBullet,
  type DeckSlide,
  type SlideLayout,
} from "@/lib/deck/schema";

const MISSING = "Not stated in the source documentation.";

function text(value: string, fallback = MISSING) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function bullets(items: string[], max = 6): DeckBullet[] {
  return items.slice(0, max).map((item) => {
    const [label, ...rest] = item.split(/\s[—–-]\s|:\s/);
    return {
      label: (label ?? item).trim(),
      detail: rest.join(" — ").trim(),
    };
  });
}

interface SlideSeed extends Partial<Omit<DeckSlide, "id" | "number" | "layout">> {
  layout: SlideLayout;
  eyebrow: string;
  title: string;
}

function slide(seed: SlideSeed, number: number): DeckSlide {
  return {
    id: `slide-${number}`,
    number,
    layout: seed.layout,
    eyebrow: seed.eyebrow,
    title: seed.title,
    subtitle: seed.subtitle ?? "",
    body: seed.body ?? "",
    bullets: seed.bullets ?? [],
    steps: seed.steps ?? [],
    tags: seed.tags ?? [],
    note: seed.note ?? "",
    closing: seed.closing ?? "",
  };
}

/** Derives a 3–5 step "how it works" flow from the available evidence. */
function deriveFlow(pitch: Pitch): string[] {
  const fromFeatures = pitch.key_features.slice(0, 5).map((f) => f.split(/\s[—–-]\s|:\s/)[0]!.trim());
  if (fromFeatures.length >= 3) return fromFeatures;
  const fromSolution = splitSentences(pitch.solution).slice(0, 5);
  if (fromSolution.length >= 3) return fromSolution;
  return [...fromFeatures, ...fromSolution].slice(0, 5);
}

/**
 * Pure, deterministic mapping: structured pitch data → 10 predefined slides.
 * Nothing here invents content; gaps are disclosed instead of filled.
 */
export function buildDeck(pitch: Pitch, generatedAt = new Date().toISOString()): Deck {
  const name = text(pitch.project_name, "Untitled Project");
  const problemPoints = splitSentences(pitch.problem);
  const flow = deriveFlow(pitch);

  const slides: DeckSlide[] = [
    {
      layout: "cover" as const,
      eyebrow: "Investor Pitch",
      title: name,
      subtitle: text(pitch.tagline, ""),
      body: text(pitch.solution ? splitSentences(pitch.solution)[0]! : "", ""),
    },
    {
      layout: "statement" as const,
      eyebrow: "01 — The Problem",
      title: "The problem",
      body: problemPoints[0] ?? MISSING,
      bullets: bullets(problemPoints.slice(1, 5).length ? problemPoints.slice(1, 5) : [], 4),
      note: pitch.problem.trim() ? "" : "No problem statement found in the documentation.",
    },
    {
      layout: "statement" as const,
      eyebrow: "02 — The Solution",
      title: "The solution",
      body: text(pitch.solution),
      bullets: bullets(pitch.key_features.slice(0, 3)),
      subtitle: pitch.problem.trim() ? "How it answers the problem" : "",
    },
    {
      layout: "flow" as const,
      eyebrow: "03 — Product",
      title: "How it works",
      steps: flow,
      note: flow.length ? "" : "The documentation does not describe a product workflow.",
    },
    {
      layout: "features" as const,
      eyebrow: "04 — Product",
      title: "Key features",
      bullets: bullets(pitch.key_features, 6),
      note: pitch.key_features.length ? "" : "No feature detail found in the documentation.",
    },
    {
      layout: "market" as const,
      eyebrow: "05 — Market",
      title: "Target market",
      body: text(pitch.market_opportunity, ""),
      bullets: bullets(pitch.target_users, 5),
      note: pitch.market_data_available ? "" : NO_MARKET_DATA_NOTE,
    },
    {
      layout: "model" as const,
      eyebrow: "06 — Business",
      title: "Business model",
      subtitle: pitch.business_model.trim() ? "Stated in documentation" : "Proposed — not stated in documentation",
      body: text(pitch.business_model, "The documentation does not describe how the product makes money."),
      note: pitch.traction.trim()
        ? pitch.traction.trim()
        : "No revenue or traction figures are claimed — none were provided.",
    },
    {
      layout: "technology" as const,
      eyebrow: "07 — Technology",
      title: "Technology & advantage",
      tags: pitch.technology.slice(0, 10),
      body: text(
        pitch.competitive_advantage[0] ?? "",
        "No technical differentiator is described in the documentation.",
      ),
      subtitle: pitch.technology.length ? "Why the stack matters" : "",
      note: pitch.technology.length ? "" : "No technology stack listed in the documentation.",
    },
    {
      layout: "advantage" as const,
      eyebrow: "08 — Defensibility",
      title: "Competitive advantage",
      bullets: bullets(pitch.competitive_advantage, 4),
      note: pitch.competitive_advantage.length
        ? "No competitor comparison — none named in the source documentation."
        : "No differentiators stated in the documentation.",
    },
    {
      layout: "roadmap" as const,
      eyebrow: "09 — Roadmap & Vision",
      title: "Where this goes",
      steps: pitch.roadmap.slice(0, 5),
      closing: text(pitch.call_to_action, ""),
      body: text(pitch.tagline, ""),
      note: pitch.roadmap.length ? "" : "No roadmap provided in the documentation.",
    },
  ].map((seed, index) => slide(seed, index + 1));

  return {
    title: name,
    subtitle: text(pitch.tagline, "Investor pitch deck"),
    generatedAt,
    slides,
  };
}
