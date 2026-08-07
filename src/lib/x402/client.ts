import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import type { ClientAvmSigner } from "@x402/avm";
import { ALGORAND_MAINNET_CAIP2, ALGORAND_TESTNET_CAIP2 } from "@x402/avm";
import { GENERATE_DECK_PATH, describePaymentError, type PaymentPhase } from "@/lib/x402/shared";
import type { Deck } from "@/lib/deck/schema";

/** What the server asks for when a deck request is unpaid. */
export interface PaymentQuote {
  raw: PaymentRequired;
  requirements: PaymentRequirements;
  /** Human-readable amount, e.g. "0.10 USDC". */
  amountLabel: string;
  networkLabel: string;
  payTo: string;
}

export interface PaymentSettlement {
  transactionId: string;
  network: string;
}

const ATOMIC_UNITS = 1_000_000;

function networkLabel(network: string): string {
  if (network === ALGORAND_TESTNET_CAIP2) return "Algorand TestNet";
  if (network === ALGORAND_MAINNET_CAIP2) return "Algorand MainNet";
  return network;
}

function toQuote(raw: PaymentRequired): PaymentQuote {
  const requirements = raw.accepts[0]!;
  const amount = Number(requirements.maxAmountRequired ?? "0") / ATOMIC_UNITS;
  return {
    raw,
    requirements,
    amountLabel: `${amount.toFixed(2)} USDC`,
    networkLabel: networkLabel(requirements.network),
    payTo: requirements.payTo,
  };
}

export type QuoteResult =
  | { type: "payment_required"; quote: PaymentQuote }
  | { type: "deck"; deck: Deck }
  | { type: "error"; message: string };

/**
 * Requests the deck without payment. A correctly configured server answers
 * HTTP 402 with the x402 payment requirements, which drives the payment UI.
 *
 * @param pitch - Structured pitch payload.
 * @param idempotencyKey - Stable key so a paid retry is never charged twice.
 * @returns The payment quote, a replayed deck, or an error message.
 */
export async function requestDeckQuote(
  pitch: unknown,
  idempotencyKey: string,
): Promise<QuoteResult> {
  const response = await fetch(GENERATE_DECK_PATH, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ pitch }),
  });

  if (response.status === 402) {
    const header = response.headers.get("PAYMENT-REQUIRED");
    if (header) {
      try {
        return { type: "payment_required", quote: toQuote(decodePaymentRequiredHeader(header)) };
      } catch {
        /* fall through to body parsing */
      }
    }
    const body = (await response.json().catch(() => null)) as PaymentRequired | null;
    if (body && Array.isArray(body.accepts) && body.accepts.length > 0) {
      return { type: "payment_required", quote: toQuote(body) };
    }
    return { type: "error", message: "The server requested payment but sent no payment terms." };
  }

  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; deck?: Deck; message?: string }
    | null;

  if (response.ok && body?.success && body.deck) return { type: "deck", deck: body.deck };

  return {
    type: "error",
    message: body?.message ?? "The deck service is unavailable. Please try again.",
  };
}

export interface PayAndGenerateArgs {
  pitch: unknown;
  idempotencyKey: string;
  signer: ClientAvmSigner;
  onPhase: (phase: PaymentPhase) => void;
}

export type PayResult =
  | { type: "success"; deck: Deck; settlement: PaymentSettlement | null }
  | { type: "error"; message: string };

/**
 * Pays the x402 invoice with the connected Algorand wallet and returns the deck.
 *
 * Uses the official `@x402/fetch` payment flow: the wrapped fetch retries the
 * request with a signed `PAYMENT-SIGNATURE` header, and the server settles the
 * payment on Algorand before returning the deck.
 *
 * @param args - Pitch payload, idempotency key, wallet signer and phase callback.
 * @returns The generated deck with its real settlement transaction, or an error.
 */
export async function payAndGenerateDeck(args: PayAndGenerateArgs): Promise<PayResult> {
  const { pitch, idempotencyKey, signer, onPhase } = args;

  const trackedSigner: ClientAvmSigner = {
    address: signer.address,
    signTransactions: async (txns, indexes) => {
      onPhase("WALLET_PENDING");
      const signed = await signer.signTransactions(txns, indexes);
      onPhase("SUBMITTING_PAYMENT");
      return signed;
    },
  };

  const client = new x402Client()
    .register(ALGORAND_TESTNET_CAIP2, new ExactAvmScheme(trackedSigner))
    .register(ALGORAND_MAINNET_CAIP2, new ExactAvmScheme(trackedSigner));

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  let response: Response;
  try {
    onPhase("SUBMITTING_PAYMENT");
    response = await fetchWithPayment(GENERATE_DECK_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ pitch }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/reject|cancel|denied|closed/i.test(message)) {
      return { type: "error", message: "You cancelled the payment in your wallet." };
    }
    return {
      type: "error",
      message: describePaymentError(message, "The payment could not be completed. Please try again."),
    };
  }

  onPhase("VERIFYING_PAYMENT");

  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; deck?: Deck; message?: string; error?: string }
    | null;

  if (!response.ok || !body?.success || !body.deck) {
    return {
      type: "error",
      message: describePaymentError(
        body?.error ?? body?.message,
        body?.message ?? "Payment was not accepted. You have not been charged for a deck.",
      ),
    };
  }

  let settlement: PaymentSettlement | null = null;
  const settleHeader = response.headers.get("PAYMENT-RESPONSE");
  if (settleHeader) {
    try {
      const decoded = decodePaymentResponseHeader(settleHeader);
      if (decoded.transaction) {
        settlement = {
          transactionId: decoded.transaction,
          network: networkLabel(decoded.network ?? ALGORAND_TESTNET_CAIP2),
        };
      }
    } catch {
      /* settlement details are informational only */
    }
  }

  onPhase("PAYMENT_SUCCESS");
  return { type: "success", deck: body.deck, settlement };
}
