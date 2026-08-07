import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SourceComposer } from "@/components/source-composer";
import { AnalysisProgress } from "@/components/analysis-progress";
import { PitchIntelligence } from "@/components/pitch-intelligence";
import { analyzeReadmeFn } from "@/lib/pitch/analyze.functions";
import type { Pitch } from "@/lib/pitch/schema";
import type { PitchSource } from "@/lib/pitch/types";


export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — Turn a README into a pitch deck | PitchForge" },
      {
        name: "description",
        content:
          "Upload a README or paste documentation, review the word count, and forge an investor-ready pitch deck.",
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
  // Backend integration point: OpenAI generation → x402 payment → PPTX/PDF export.
  function handleGenerate(source: PitchSource) {
    toast("Generation is not wired up yet", {
      description: `${source.fileName ?? "Pasted documentation"} — ${source.content.length.toLocaleString()} characters staged.`,
    });
  }

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
          <SourceComposer onGenerate={handleGenerate} />
        </div>

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
