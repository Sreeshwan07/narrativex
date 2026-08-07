import { DECK_SIZE, type DeckSlide } from "@/lib/deck/schema";

/** Shared paper-and-ink palette used by both exporters (literal hex, no CSS tokens). */
export const DECK_COLORS = {
  paper: "FBF7F0",
  card: "FFFDF9",
  ink: "241F1A",
  muted: "6E655A",
  ember: "C2410C",
  rule: "E3DACB",
} as const;

export type DrawOp =
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: string; radius?: number }
  | {
      kind: "text";
      x: number;
      y: number;
      w: number;
      text: string;
      size: number;
      color: string;
      font: "serif" | "sans";
      bold?: boolean;
      italic?: boolean;
      caps?: boolean;
      lineHeight?: number;
    };

const W = DECK_SIZE.width;
const H = DECK_SIZE.height;
const M = 84;

/** Rough wrapped-line count so stacked blocks never collide. */
export function estimateLines(text: string, width: number, size: number) {
  const perLine = Math.max(1, Math.floor(width / (size * 0.5)));
  return Math.max(1, Math.ceil(text.length / perLine));
}

function blockHeight(text: string, width: number, size: number, lh = 1.35) {
  return estimateLines(text, width, size) * size * lh;
}

function header(slide: DeckSlide, ops: DrawOp[]) {
  ops.push({
    kind: "text",
    x: M,
    y: 56,
    w: W - M * 2,
    text: slide.eyebrow,
    size: 15,
    color: DECK_COLORS.ember,
    font: "sans",
    bold: true,
    caps: true,
  });
  ops.push({ kind: "rect", x: M, y: 92, w: W - M * 2, h: 1, color: DECK_COLORS.rule });
  ops.push({
    kind: "text",
    x: M,
    y: 116,
    w: W - M * 2,
    text: slide.title,
    size: 54,
    color: DECK_COLORS.ink,
    font: "serif",
  });
}

function footer(slide: DeckSlide, ops: DrawOp[]) {
  ops.push({ kind: "rect", x: M, y: H - 66, w: W - M * 2, h: 1, color: DECK_COLORS.rule });
  ops.push({
    kind: "text",
    x: M,
    y: H - 52,
    w: W - M * 2 - 60,
    text: "Generated from your project documentation",
    size: 13,
    color: DECK_COLORS.muted,
    font: "sans",
  });
  ops.push({
    kind: "text",
    x: W - M - 60,
    y: H - 52,
    w: 60,
    text: String(slide.number).padStart(2, "0"),
    size: 13,
    color: DECK_COLORS.muted,
    font: "sans",
    bold: true,
  });
}

function note(slide: DeckSlide, ops: DrawOp[], y: number) {
  if (!slide.note) return;
  ops.push({ kind: "rect", x: M, y, w: 3, h: 34, color: DECK_COLORS.ember });
  ops.push({
    kind: "text",
    x: M + 16,
    y: y + 8,
    w: W - M * 2 - 16,
    text: slide.note,
    size: 15,
    color: DECK_COLORS.muted,
    font: "sans",
    italic: true,
  });
}

/** Converts one slide into resolution-independent draw operations. */
export function slideToOps(slide: DeckSlide): DrawOp[] {
  const ops: DrawOp[] = [{ kind: "rect", x: 0, y: 0, w: W, h: H, color: DECK_COLORS.paper }];
  const content = W - M * 2;

  if (slide.layout === "cover") {
    ops.push({ kind: "rect", x: 0, y: 0, w: 10, h: H, color: DECK_COLORS.ember });
    ops.push({
      kind: "text",
      x: M,
      y: 150,
      w: content,
      text: slide.eyebrow,
      size: 16,
      color: DECK_COLORS.ember,
      font: "sans",
      bold: true,
      caps: true,
    });
    ops.push({
      kind: "text",
      x: M,
      y: 200,
      w: content,
      text: slide.title,
      size: 92,
      color: DECK_COLORS.ink,
      font: "serif",
    });
    if (slide.subtitle) {
      ops.push({
        kind: "text",
        x: M,
        y: 330,
        w: content - 120,
        text: slide.subtitle,
        size: 34,
        color: DECK_COLORS.ember,
        font: "serif",
        italic: true,
      });
    }
    if (slide.body) {
      ops.push({
        kind: "text",
        x: M,
        y: 430,
        w: content - 240,
        text: slide.body,
        size: 20,
        color: DECK_COLORS.muted,
        font: "sans",
      });
    }
    footer(slide, ops);
    return ops;
  }

  header(slide, ops);
  let y = 210;

  if (slide.subtitle) {
    ops.push({
      kind: "text",
      x: M,
      y,
      w: content,
      text: slide.subtitle,
      size: 16,
      color: DECK_COLORS.ember,
      font: "sans",
      bold: true,
      caps: true,
    });
    y += 34;
  }

  if (slide.body && slide.layout !== "roadmap") {
    ops.push({
      kind: "text",
      x: M,
      y,
      w: content - 120,
      text: slide.body,
      size: 26,
      color: DECK_COLORS.ink,
      font: "sans",
    });
    y += blockHeight(slide.body, content - 120, 26) + 28;
  }

  if (slide.tags.length) {
    let tx = M;
    let ty = y;
    for (const tag of slide.tags) {
      const w = Math.max(90, tag.length * 10 + 32);
      if (tx + w > W - M) {
        tx = M;
        ty += 48;
      }
      ops.push({ kind: "rect", x: tx, y: ty, w, h: 38, color: DECK_COLORS.card, radius: 19 });
      ops.push({
        kind: "text",
        x: tx + 16,
        y: ty + 11,
        w: w - 32,
        text: tag,
        size: 15,
        color: DECK_COLORS.ink,
        font: "sans",
      });
      tx += w + 12;
    }
    y = ty + 62;
  }

  if (slide.steps.length) {
    const count = slide.steps.length;
    const gap = 16;
    const cardW = (content - gap * (count - 1)) / count;
    slide.steps.forEach((step, i) => {
      const x = M + i * (cardW + gap);
      ops.push({ kind: "rect", x, y, w: cardW, h: 200, color: DECK_COLORS.card, radius: 14 });
      ops.push({ kind: "rect", x, y, w: cardW, h: 4, color: DECK_COLORS.ember, radius: 2 });
      ops.push({
        kind: "text",
        x: x + 22,
        y: y + 26,
        w: cardW - 44,
        text: String(i + 1).padStart(2, "0"),
        size: 15,
        color: DECK_COLORS.ember,
        font: "sans",
        bold: true,
      });
      ops.push({
        kind: "text",
        x: x + 22,
        y: y + 62,
        w: cardW - 44,
        text: step,
        size: 19,
        color: DECK_COLORS.ink,
        font: "sans",
      });
    });
    y += 226;
  }

  if (slide.bullets.length) {
    const twoCol = slide.bullets.length > 3;
    const colW = twoCol ? (content - 28) / 2 : content;
    slide.bullets.forEach((bullet, i) => {
      const col = twoCol ? i % 2 : 0;
      const row = twoCol ? Math.floor(i / 2) : i;
      const x = M + col * (colW + 28);
      const by = y + row * (slide.bullets.some((b) => b.detail) ? 96 : 56);
      ops.push({ kind: "rect", x, y: by + 10, w: 6, h: 6, color: DECK_COLORS.ember, radius: 3 });
      ops.push({
        kind: "text",
        x: x + 22,
        y: by,
        w: colW - 22,
        text: bullet.label,
        size: 22,
        color: DECK_COLORS.ink,
        font: "sans",
        bold: true,
      });
      if (bullet.detail) {
        ops.push({
          kind: "text",
          x: x + 22,
          y: by + 32,
          w: colW - 22,
          text: bullet.detail,
          size: 17,
          color: DECK_COLORS.muted,
          font: "sans",
        });
      }
    });
    const rows = twoCol ? Math.ceil(slide.bullets.length / 2) : slide.bullets.length;
    y += rows * (slide.bullets.some((b) => b.detail) ? 96 : 56) + 12;
  }

  if (slide.closing) {
    ops.push({
      kind: "text",
      x: M,
      y: Math.min(y, H - 190),
      w: content - 100,
      text: slide.closing,
      size: 30,
      color: DECK_COLORS.ember,
      font: "serif",
      italic: true,
    });
  }

  note(slide, ops, H - 130);
  footer(slide, ops);
  return ops;
}
