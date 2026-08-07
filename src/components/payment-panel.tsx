import { useState } from "react";
import { useWallet } from "@txnlab/use-wallet-react";
import { ExternalLink, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { explorerTxUrl, PAYMENT_PHASE_LABEL, type PaymentPhase } from "@/lib/x402/shared";
import type { PaymentQuote, PaymentSettlement } from "@/lib/x402/client";
import type { ClientAvmSigner } from "@x402/avm";

const BUSY: PaymentPhase[] = [
  "WALLET_CONNECTING",
  "WALLET_PENDING",
  "SUBMITTING_PAYMENT",
  "VERIFYING_PAYMENT",
];

interface PaymentPanelProps {
  quote: PaymentQuote;
  phase: PaymentPhase;
  error: string | null;
  settlement: PaymentSettlement | null;
  onPay: (signer: ClientAvmSigner) => void;
  onPhase: (phase: PaymentPhase) => void;
}

/**
 * x402 payment step: connect an Algorand wallet, then pay the real invoice.
 *
 * @param props - Quote, current phase, error/settlement state and callbacks.
 * @returns The payment panel.
 */
export function PaymentPanel({
  quote,
  phase,
  error,
  settlement,
  onPay,
  onPhase,
}: PaymentPanelProps) {
  const { wallets, activeAddress, activeWallet, signTransactions } = useWallet();
  const [connecting, setConnecting] = useState<string | null>(null);
  const busy = BUSY.includes(phase);

  const handleConnect = async (walletId: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    setConnecting(walletId);
    onPhase("WALLET_CONNECTING");
    try {
      await wallet.connect();
      onPhase("PAYMENT_REQUIRED");
    } catch {
      onPhase("PAYMENT_REQUIRED");
    } finally {
      setConnecting(null);
    }
  };

  const handlePay = () => {
    if (!activeAddress) return;
    onPay({
      address: activeAddress,
      signTransactions: (txns, indexes) => signTransactions(txns, indexes),
    });
  };

  return (
    <section className="animate-rise rounded-xl border border-ember/40 bg-card p-7 shadow-lift">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4">
        <span className="rule-label">Payment Required — x402</span>
        <span className="rule-label">{quote.networkLabel}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-display text-4xl">{quote.amountLabel}</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            One payment, one deck. Settlement happens on {quote.networkLabel} through the x402
            protocol — your deck is released only after the payment is verified.
          </p>
        </div>
        <dl className="space-y-1 font-mono text-xs text-muted-foreground">
          <div>
            <dt className="inline">Receiver: </dt>
            <dd className="inline break-all">
              {quote.payTo.slice(0, 8)}…{quote.payTo.slice(-6)}
            </dd>
          </div>
          <div>
            <dt className="inline">Scheme: </dt>
            <dd className="inline">exact · USDC</dd>
          </div>
        </dl>
      </div>

      {!activeAddress ? (
        <div className="mt-7 border-t border-border pt-6">
          <span className="rule-label">Connect a wallet</span>
          <div className="mt-3 flex flex-wrap gap-3">
            {wallets.map((wallet) => (
              <Button
                key={wallet.id}
                variant="quiet"
                disabled={connecting !== null}
                onClick={() => handleConnect(wallet.id)}
              >
                {connecting === wallet.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wallet className="size-4" />
                )}
                {wallet.metadata.name}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            You need TestNet USDC (asset 10458941) and a small amount of ALGO for fees.
          </p>
        </div>
      ) : (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <div className="font-mono text-xs text-muted-foreground">
            <p>
              {activeWallet?.metadata.name} · {activeAddress.slice(0, 8)}…{activeAddress.slice(-6)}
            </p>
            <button
              type="button"
              className="mt-1 underline underline-offset-4 hover:text-foreground"
              onClick={() => activeWallet?.disconnect()}
            >
              Disconnect
            </button>
          </div>
          <Button variant="ink" disabled={busy} onClick={handlePay}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {busy ? PAYMENT_PHASE_LABEL[phase] : `Pay ${quote.amountLabel} & Generate Deck`}
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-5 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {settlement && (
        <div className="mt-5 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          <span className="rule-label">Payment settled</span>
          <a
            className="mt-2 flex items-center gap-2 break-all font-mono text-xs text-ember underline underline-offset-4"
            href={explorerTxUrl(settlement.transactionId, settlement.network)}
            target="_blank"
            rel="noreferrer"
          >
            {settlement.transactionId}
            <ExternalLink className="size-3 shrink-0" />
          </a>
        </div>
      )}
    </section>
  );
}
