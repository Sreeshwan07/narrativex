import { useCallback, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Sparkles } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SourceComposer } from "@/components/source-composer";
import { AnalysisProgress } from "@/components/analysis-progress";
import { PitchIntelligence } from "@/components/pitch-intelligence";
import { DeckPreview } from "@/components/deck-preview";
import { AlgorandWalletProvider } from "@/components/wallet-provider";
import { PaymentPanel } from "@/components/payment-panel";
import { Button } from "@/components/ui/button";
import { analyzeReadmeFn } from "@/lib/pitch/analyze.functions";
import {
  payAndGenerateDeck,
  requestDeckQuote,
  type PaymentQuote,
  type PaymentSettlement,
} from "@/lib/x402/client";
import { explorerTxUrl, PAYMENT_PHASE_LABEL, type PaymentPhase } from "@/lib/x402/shared";
import type { ClientAvmSigner } from "@x402/avm";
import type { Pitch } from "@/lib/pitch/schema";
import type { Deck } from "@/lib/deck/schema";
import type { PitchSource } from "@/lib/pitch/types";

const ANALYZE_STAGES = [
  "Reading your project…",
  "Finding the problem…",
  "Extracting the evidence…",
  "Structuring your pitch…",
] as const;

const PAYMENT_STAGES = [
  "Requesting the deck",
  "Awaiting wallet approval",
  "Settling payment on Algorand",
  "Building your investor deck",
  "Ready to present",
] as const;

const PHASE_STAGE: Partial<Record<PaymentPhase, number>> = {
  PAYMENT_REQUIRED: 0,
  WALLET_CONNECTING: 0,
  WALLET_PENDING: 1,
  SUBMITTING_PAYMENT: 2,
  VERIFYING_PAYMENT: 2,
  PAYMENT_SUCCESS: 3,
  GENERATING_DECK: 3,
  COMPLETE: 4,
};

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — Turn a README into a pitch deck | PitchForge" },
      {
        name: "description",
        content:
          "Upload a README or paste documentation, review the extracted pitch, and pay $0.10 USDC on Algorand TestNet to generate a 10-slide investor deck.",
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
  const [analyzeStage, setAnalyzeStage] = useState(0);

  const [phase, setPhase] = useState<PaymentPhase>("IDLE");
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [settlement, setSettlement] = useState<PaymentSettlement | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [requesting, setRequesting] = useState(false);
  const idempotencyKey = useRef<string>("");

  const resetPayment = useCallback(() => {
    setPhase("IDLE");
    setQuote(null);
    setSettlement(null);
    setPayError(null);
    setDeck(null);
  }, []);

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

  /** Step 1 of the paid flow: ask the server for the deck and expect HTTP 402. */
  const startGeneration = async (pitch: Pitch) => {
    setRequesting(true);
    setPayError(null);
    idempotencyKey.current = crypto.randomUUID();
    try {
      const result = await requestDeckQuote(pitch, idempotencyKey.current);
      if (result.type === "payment_required") {
        setQuote(result.quote);
        setPhase("PAYMENT_REQUIRED");
      } else if (result.type === "deck") {
        setDeck(result.deck);
        setPhase("COMPLETE");
      } else {
        setPhase("ERROR");
        setPayError(result.message);
        toast.error(result.message);
      }
    } catch {
      setPhase("ERROR");
      setPayError("Could not reach the deck service. Please try again.");
    } finally {
      setRequesting(false);
    }
  };

  /** Step 2: sign and settle the x402 invoice, then receive the deck. */
  const pay = async (signer: ClientAvmSigner) => {
    if (!analysis.data || !quote) return;
    setPayError(null);
    const result = await payAndGenerateDeck({
      pitch: analysis.data,
      quote,
      idempotencyKey: idempotencyKey.current,
      signer,
      onPhase: setPhase,
    });


    if (result.type === "error") {
      setPhase("ERROR");
      setPayError(result.message);
      toast.error(result.message);
      return;
    }

    setSettlement(result.settlement);
    setPhase("GENERATING_DECK");
    setDeck(result.deck);
    setPhase("COMPLETE");
    toast.success("Payment verified — your deck is ready.");
  };

  const showDeck = deck !== null;
  const paying = ["WALLET_PENDING", "SUBMITTING_PAYMENT", "VERIFYING_PAYMENT"].includes(phase);

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
              resetPayment();
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

        {(requesting || paying) && (
          <div className="mt-10">
            <AnalysisProgress
              stage={PHASE_STAGE[phase] ?? 0}
              stages={PAYMENT_STAGES}
              label={PAYMENT_PHASE_LABEL[phase]}
            />
          </div>
        )}

        {showDeck && (
          <div className="mt-14">
            {settlement && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-4">
                <div>
                  <span className="rule-label">Payment settled — {settlement.network}</span>
                  <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                    {settlement.transactionId}
                  </p>
                </div>
                <a
                  className="flex items-center gap-2 font-mono text-xs text-ember underline underline-offset-4"
                  href={explorerTxUrl(settlement.transactionId, settlement.network)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Algorand Explorer
                  <ExternalLink className="size-3" />
                </a>
              </div>
            )}
            <DeckPreview deck={deck} />
          </div>
        )}

        {analysis.isSuccess && !analysis.isPending && !showDeck && (
          <>
            <div className="mt-14">
              <PitchIntelligence pitch={analysis.data} />
            </div>

            {quote ? (
              <div className="mt-8">
                <ClientOnly fallback={null}>
                  <AlgorandWalletProvider>
                    <PaymentPanel
                      quote={quote}
                      phase={phase}
                      error={payError}
                      settlement={settlement}
                      onPay={(signer) => void pay(signer)}
                      onPhase={setPhase}
                    />
                  </AlgorandWalletProvider>
                </ClientOnly>
              </div>
            ) : (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6 shadow-paper">
                <div>
                  <p className="font-display text-2xl">Ready to forge the deck.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ten investor slides, built from the evidence above — nothing invented. Payment
                    is requested by the server before anything is generated.
                  </p>
                  {payError && <p className="mt-2 text-sm text-destructive">{payError}</p>}
                </div>
                <Button
                  variant="ink"
                  disabled={requesting}
                  onClick={() => void startGeneration(analysis.data)}
                >
                  <Sparkles className="size-4" />
                  {requesting ? "Preparing…" : "Generate Pitch Deck"}
                </Button>
              </div>
            )}
          </>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-6">
          <span className="rule-label">Pay-per-generation • x402 • Algorand TestNet</span>
          <span className="text-xs text-muted-foreground">
            No account required. You pay only when a deck is produced.
          </span>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
