import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SourceComposer } from "@/components/source-composer";
import { AnalysisProgress, DECK_STAGES } from "@/components/analysis-progress";
import { PitchIntelligence } from "@/components/pitch-intelligence";
import { DeckPreview } from "@/components/deck-preview";
import { Button } from "@/components/ui/button";
import { analyzeReadmeFn } from "@/lib/pitch/analyze.functions";
import { generateDeckFn } from "@/lib/deck/generate.functions";
import type { Pitch } from "@/lib/pitch/schema";
import type { Deck } from "@/lib/deck/schema";
import type { PitchSource } from "@/lib/pitch/types";

const ANALYZE_STAGES = [
  "Reading your project…",
  "Finding the problem…",
  "Extracting the evidence…",
  "Structuring your pitch…",
] as const;

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — Turn a README into a pitch deck | PitchForge" },
      {
        name: "description",
        content:
          "Upload a README or paste documentation, review the extracted pitch, and generate a downloadable 10-slide investor deck.",
      },
      { property: "og:title", content: "PitchForge Workspace" },
      {
        property: "og:description",
        content: "Upload a README or paste docs and generate an investor-ready deck.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const analyze = useServerFn(analyzeReadmeFn);
  const generate = useServerFn(generateDeckFn);
  const [analyzeStage, setAnalyzeStage] = useState(0);
  const [deckStage, setDeckStage] = useState(0);

  const analysis = useMutation<Pitch, Error, PitchSource>({
    mutationFn: async (source) => {
      setAnalyzeStage(0);
      const tick = setInterval(
        () => setAnalyzeStage((s) => Math.min(s + 1, ANALYZE_STAGES.length - 2)),
        2400,
      );
      try {
        const result = await analyze({ data: { content: source.content } });
        if (!result.success) throw new Error(result.error);
        setAnalyzeStage(ANALYZE_STAGES.length - 1);
        return result.pitch;
      } finally {
        clearInterval(tick);
      }
    },
    onError: (error) => toast.error(error.message || "Analysis failed."),
  });

  // Next step plugs in here: an x402-protected wrapper around generateDeckFn.
  const deck = useMutation<Deck, Error, Pitch>({
    mutationFn: async (pitch) => {
      setDeckStage(0);
      await new Promise((r) => setTimeout(r, 120));
      setDeckStage(1);
      const result = await generate({ data: { pitch } });
      if (!result.success) throw new Error(result.error);
      setDeckStage(2);
      // Warm the export pipeline so the download buttons respond instantly.
      await import("@/lib/deck/export");
      setDeckStage(3);
      await new Promise((r) => setTimeout(r, 200));
      setDeckStage(DECK_STAGES.length - 1);
      return result.deck;
    },
    onError: (error) => toast.error(error.message || "Deck generation failed."),
  });

  const showDeck = deck.isSuccess && !deck.isPending;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <div className="animate-rise">
          <span className="rule-label">Step 01 — Source</span>
          <h1 className="mt-3 text-4xl sm:text-5xl">Bring your documentation.</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Drop a README, or paste any technical write-up. PitchForge reads the substance and
            rewrites it as a narrative investors follow.
          </p>
        </div>

        <div className="mt-10 animate-rise" style={{ animationDelay: "80ms" }}>
          <SourceComposer
            onGenerate={(source) => {
              deck.reset();
              analysis.mutate(source);
            }}
            pending={analysis.isPending}
          />
        </div>

        {analysis.isPending && (
          <div className="mt-10">
            <AnalysisProgress stage={analyzeStage} stages={ANALYZE_STAGES} label="Analysing" />
          </div>
        )}

        {deck.isPending && (
          <div className="mt-10">
            <AnalysisProgress stage={deckStage} label="Building your deck" />
          </div>
        )}

        {showDeck && (
          <div className="mt-14">
            <DeckPreview deck={deck.data} />
          </div>
        )}

        {analysis.isSuccess && !analysis.isPending && !showDeck && !deck.isPending && (
          <>
            <div className="mt-14">
              <PitchIntelligence pitch={analysis.data} />
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6 shadow-paper">
              <div>
                <p className="font-display text-2xl">Ready to forge the deck.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ten investor slides, built from the evidence above — nothing invented.
                </p>
              </div>
              <Button variant="ink" onClick={() => deck.mutate(analysis.data)}>
                <Sparkles className="size-4" />
                Generate Pitch Deck
              </Button>
            </div>
          </>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-6">
          <span className="rule-label">Pay-per-generation • x402 • Algorand</span>
          <span className="text-xs text-muted-foreground">
            No account required. You pay only when a deck is produced.
          </span>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
