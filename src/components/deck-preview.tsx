import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Palette,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SlideCanvas } from "@/components/slide-canvas";
import { SlideInspector } from "@/components/slide-inspector";
import { Chip, SectionHeading } from "@/components/primitives";
import { useDeckEditor } from "@/hooks/use-deck-editor";
import {
  addSlide,
  deleteSlide,
  duplicateSlide,
  moveSlide,
  updateSlide,
} from "@/lib/deck/editing";
import { DECK_SIZE, type Deck, type DeckSlide } from "@/lib/deck/schema";
import { getDeckLength, getDeckStyle } from "@/lib/deck/styles";
import { cn } from "@/lib/utils";

function ScaledSlide({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / DECK_SIZE.width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: DECK_SIZE.width, height: DECK_SIZE.height, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

export function DeckPreview({ deck: generated, onRestyle }: { deck: Deck; onRestyle?: () => void }) {
  const { deck, commit, undo, redo, canUndo, canRedo } = useDeckEditor(generated);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"pptx" | "pdf" | null>(null);

  const total = deck.slides.length;
  const safeIndex = Math.min(index, total - 1);
  const current = deck.slides[safeIndex]!;
  const style = getDeckStyle(deck.style);
  const length = getDeckLength(deck.length);

  useEffect(() => {
    if (index > total - 1) setIndex(Math.max(0, total - 1));
  }, [index, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, total - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, undo, redo]);

  const patchSlide = (patch: Partial<DeckSlide>) =>
    commit((d) => updateSlide(d, safeIndex, patch));

  const handleExport = async (format: "pptx" | "pdf") => {
    setBusy(format);
    try {
      const mod = await import("@/lib/deck/export");
      // Exports always read the edited deck, so the file matches the preview.
      if (format === "pptx") await mod.exportPptx(deck);
      else await mod.exportPdf(deck);
      toast.success(`${format.toUpperCase()} downloaded.`);
    } catch {
      toast.error(`Could not build the ${format.toUpperCase()} file.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="animate-rise">
      <SectionHeading
        step="Step 04 — Deck Editor"
        note="Edit any slide — exports use your edited content"
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip tone="ember">{style.name}</Chip>
        <Chip>{length.name}</Chip>
        <Chip>{total} slides</Chip>
        <Chip tone={deck.quality.gaps.length ? "warning" : "positive"}>
          {deck.quality.score}% evidence-backed
        </Chip>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="quiet"
            size="sm"
            aria-label="Undo"
            className="min-h-9 min-w-9"
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="quiet"
            size="sm"
            aria-label="Redo"
            className="min-h-9 min-w-9"
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 className="size-4" />
          </Button>
          <Button
            variant={editing ? "ink" : "quiet"}
            size="sm"
            className="min-h-9"
            aria-pressed={editing}
            onClick={() => setEditing((v) => !v)}
          >
            <Pencil className="size-4" />
            {editing ? "Done editing" : "Edit deck"}
          </Button>
          {onRestyle && (
            <Button variant="quiet" size="sm" className="min-h-9" onClick={onRestyle}>
              <Palette className="size-4" />
              Try another style
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "mt-6 grid gap-6",
          editing ? "lg:grid-cols-[170px_minmax(0,1fr)_340px]" : "lg:grid-cols-[190px_1fr]",
        )}
      >
        <div className="min-w-0">
          <ol className="flex gap-3 overflow-x-auto pb-2 lg:max-h-[560px] lg:flex-col lg:overflow-y-auto lg:pr-2">
            {deck.slides.map((slide, i) => (
              <li key={slide.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === safeIndex}
                  className={cn(
                    "w-40 overflow-hidden rounded-xl border bg-card text-left transition-all duration-300 hover:-translate-y-0.5 lg:w-full",
                    i === safeIndex
                      ? "border-ember shadow-lift"
                      : "border-border opacity-70 hover:opacity-100",
                  )}
                >
                  <ScaledSlide>
                    <SlideCanvas slide={slide} styleId={deck.style} />
                  </ScaledSlide>
                  <span className="block border-t border-border px-2 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted-foreground">
                    {String(slide.number).padStart(2, "0")} · {slide.title}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {editing && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="quiet"
                size="sm"
                className="min-h-9"
                onClick={() => {
                  commit((d) => addSlide(d, safeIndex));
                  setIndex(safeIndex + 1);
                }}
              >
                <Plus className="size-3.5" />
                Add
              </Button>
              <Button
                variant="quiet"
                size="sm"
                className="min-h-9"
                onClick={() => {
                  commit((d) => duplicateSlide(d, safeIndex));
                  setIndex(safeIndex + 1);
                }}
              >
                <Copy className="size-3.5" />
                Duplicate
              </Button>
              <Button
                variant="quiet"
                size="sm"
                aria-label="Move slide up"
                className="min-h-9"
                disabled={safeIndex === 0}
                onClick={() => {
                  commit((d) => moveSlide(d, safeIndex, safeIndex - 1));
                  setIndex(Math.max(0, safeIndex - 1));
                }}
              >
                <ArrowUp className="size-3.5" />
                Up
              </Button>
              <Button
                variant="quiet"
                size="sm"
                aria-label="Move slide down"
                className="min-h-9"
                disabled={safeIndex === total - 1}
                onClick={() => {
                  commit((d) => moveSlide(d, safeIndex, safeIndex + 1));
                  setIndex(Math.min(total - 1, safeIndex + 1));
                }}
              >
                <ArrowDown className="size-3.5" />
                Down
              </Button>
              <Button
                variant="quiet"
                size="sm"
                className="col-span-2 min-h-9 text-destructive"
                disabled={total <= 1}
                onClick={() => {
                  commit((d) => deleteSlide(d, safeIndex));
                  setIndex(Math.max(0, safeIndex - 1));
                }}
              >
                <Trash2 className="size-3.5" />
                Delete slide
              </Button>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-border shadow-lift">
            <ScaledSlide key={current.id}>
              <SlideCanvas slide={current} styleId={deck.style} />
            </ScaledSlide>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="quiet"
                size="sm"
                aria-label="Previous slide"
                className="min-h-11 min-w-11"
                disabled={safeIndex === 0}
                onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="font-mono text-sm text-muted-foreground">
                {String(safeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </span>
              <Button
                variant="quiet"
                size="sm"
                aria-label="Next slide"
                className="min-h-11 min-w-11"
                disabled={safeIndex === total - 1}
                onClick={() => setIndex((i) => Math.min(i + 1, total - 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="ink"
                size="lg"
                className="min-h-11"
                disabled={busy !== null}
                onClick={() => handleExport("pptx")}
              >
                <Download className="size-4" />
                {busy === "pptx" ? "Building…" : "Download Pitch Deck (PPTX)"}
              </Button>
              <Button
                variant="quiet"
                size="lg"
                className="min-h-11"
                disabled={busy !== null}
                onClick={() => handleExport("pdf")}
              >
                <FileText className="size-4" />
                {busy === "pdf" ? "Building…" : "Download PDF"}
              </Button>
            </div>
          </div>

          {deck.quality.gaps.length > 0 && (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Slides marked as gaps ({deck.quality.gaps.join(", ")}) disclose missing evidence rather
              than inventing figures.
            </p>
          )}
        </div>

        {editing && (
          <aside className="min-w-0 rounded-2xl border border-border bg-card p-4 lg:max-h-[720px] lg:overflow-y-auto">
            <SlideInspector slide={current} styleId={deck.style} onPatch={patchSlide} />
          </aside>
        )}
      </div>
    </section>
  );
}
