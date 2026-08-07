// Must run before any @x402 module: installs Buffer for the browser.
import "@/lib/x402/buffer-polyfill";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import type { ClientAvmSigner } from "@x402/avm";
import {
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
} from "@x402/avm";

/** Full-genesis-hash network ids, matching what the facilitator advertises. */
const ALGORAND_MAINNET_NETWORK = `algorand:${ALGORAND_MAINNET_GENESIS_HASH}`;
const ALGORAND_TESTNET_NETWORK = `algorand:${ALGORAND_TESTNET_GENESIS_HASH}`;
import { hasBuffer } from "@/lib/x402/buffer-polyfill";
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
  if (network === ALGORAND_TESTNET_CAIP2 || network === ALGORAND_TESTNET_NETWORK)
    return "Algorand TestNet";
  if (network === ALGORAND_MAINNET_CAIP2 || network === ALGORAND_MAINNET_NETWORK)
    return "Algorand MainNet";
  return network;
}

function toQuote(raw: PaymentRequired): PaymentQuote {
  const requirements = raw.accepts[0]!;
  const amount = Number(requirements.amount ?? "0") / ATOMIC_UNITS;
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
  options?: unknown,
): Promise<QuoteResult> {
  const response = await fetch(GENERATE_DECK_PATH, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ pitch, options }),
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

function isTestnet(network: string): boolean {
  return network === ALGORAND_TESTNET_CAIP2 || network === ALGORAND_TESTNET_NETWORK;
}

function algodBaseUrl(network: string): string {
  return isTestnet(network)
    ? "https://testnet-api.algonode.cloud"
    : "https://mainnet-api.algonode.cloud";
}

/** Minimum microALGO balance we require before asking the wallet to sign. */
const MIN_MICROALGO_FOR_FEES = 2_000;

interface AlgodAccount {
  amount?: number;
  assets?: Array<{ "asset-id": number; amount: number }>;
}

/**
 * Read-only pre-flight against public algod. Blocks the payment attempt when
 * the payer cannot possibly settle it (wrong account, no opt-in, no funds), so
 * the user is never asked to sign a transaction that must fail.
 *
 * @param quote - Payment requirements returned by the server.
 * @param payer - Connected wallet address (never the receiver).
 * @returns An error message, or null when the payer looks able to pay.
 */
export async function preflightPayer(
  requirements: PaymentRequirements,
  payer: string,
): Promise<string | null> {
  if (payer === requirements.payTo) {
    return "Your connected wallet is the NarrativeX receiving account. Connect a different Algorand TestNet account as the payer.";
  }

  const assetId = String(requirements.asset ?? "");
  const required = BigInt(requirements.amount ?? "0");
  const network = requirements.network;

  let account: AlgodAccount;
  try {
    const res = await fetch(`${algodBaseUrl(network)}/v2/accounts/${payer}`, {
      headers: { accept: "application/json" },
    });
    if (res.status === 404) {
      return "This account does not exist on Algorand TestNet yet. Fund it with TestNet ALGO before paying.";
    }
    if (!res.ok) return null; // don't block on a transient node error
    account = (await res.json()) as AlgodAccount;
  } catch {
    return null;
  }

  if ((account.amount ?? 0) < MIN_MICROALGO_FOR_FEES) {
    return "Your wallet has no TestNet ALGO to cover the transaction fee. Fund it from the Algorand TestNet dispenser and try again.";
  }

  const holding = (account.assets ?? []).find((a) => String(a["asset-id"]) === assetId);
  if (!holding) {
    return `Your wallet is not opted in to Algorand TestNet USDC (asset ${assetId}). Opt in to that asset in Pera, then try again.`;
  }
  if (BigInt(holding.amount ?? 0) < required) {
    const need = Number(required) / ATOMIC_UNITS;
    const have = Number(holding.amount ?? 0) / ATOMIC_UNITS;
    return `Insufficient TestNet USDC: this payment needs ${need.toFixed(2)} USDC but your wallet holds ${have.toFixed(2)} USDC.`;
  }

  return null;
}

export interface PayAndGenerateArgs {
  pitch: unknown;
  options?: unknown;
  quote: PaymentQuote;
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
/**
 * Verifies every object the x402 payload builder dereferences, naming the exact
 * one that is missing rather than throwing a generic TypeError.
 *
 * @param args - Payment arguments handed to {@link payAndGenerateDeck}.
 * @returns A specific error message, or null when all inputs are present.
 */
function describeMissingPaymentInputs(args: PayAndGenerateArgs): string | null {
  const { quote, signer } = args;
  if (!quote) return "Payment payload error: the payment quote is missing. Re-run the analysis.";
  const req = quote.requirements as PaymentRequirements | undefined;
  if (!req) return "Payment payload error: the server sent no payment requirements.";
  if (!req.payTo) return "Payment payload error: the payment requirements have no receiver (payTo).";
  if (!req.network) return "Payment payload error: the payment requirements have no network.";
  if (req.asset === undefined || req.asset === null)
    return "Payment payload error: the payment requirements have no asset id.";
  if (!req.amount) return "Payment payload error: the payment requirements have no amount.";
  if (!signer) return "Payment payload error: no wallet signer is available. Reconnect your wallet.";
  if (!signer.address)
    return "Payment payload error: the connected wallet did not expose an account address. Reconnect your wallet.";
  if (typeof signer.signTransactions !== "function")
    return "Payment payload error: the connected wallet cannot sign transactions. Reconnect your wallet.";
  return null;
}

/**
 * Single in-flight payment guard. Pera (and every WalletConnect wallet) allows
 * exactly one pending transaction request; a second one fails with code 4100.
 */
let inFlightPayment: Promise<PayResult> | null = null;

/** True while a wallet payment request is still pending. */
export function isPaymentInFlight(): boolean {
  return inFlightPayment !== null;
}

/** Recognises Pera's "another request in progress" error (code 4100). */
function isPendingWalletRequest(message: string): boolean {
  return /\b4100\b/.test(message) || /another transaction request in progress/i.test(message);
}

export async function payAndGenerateDeck(args: PayAndGenerateArgs): Promise<PayResult> {
  if (inFlightPayment) {
    console.warn("[x402] payment already in flight — awaiting the existing request");
    return inFlightPayment;
  }
  const run = runPayment(args);
  inFlightPayment = run;
  try {
    return await run;
  } finally {
    inFlightPayment = null;
    console.info("[x402] payment lifecycle finished");
  }
}

async function runPayment(args: PayAndGenerateArgs): Promise<PayResult> {
  const { pitch, options, idempotencyKey, signer, onPhase } = args;
  console.info("[x402] payment lifecycle started", { idempotencyKey, payer: signer?.address });

  const trackedSigner: ClientAvmSigner = {
    address: signer.address,
    signTransactions: async (txns, indexes) => {
      if (!txns || txns.length === 0) {
        throw new Error("Payment payload error: x402 produced no Algorand transaction to sign.");
      }
      console.info("[x402] transactions to sign", txns.length, "indexes", indexes);
      onPhase("WALLET_PENDING");
      const signed = await signer.signTransactions(txns, indexes);
      onPhase("SUBMITTING_PAYMENT");
      return signed;
    },
  };

  // Fail loudly and specifically instead of letting an undefined object
  // surface as "Cannot read properties of undefined".
  const missing = describeMissingPaymentInputs(args);
  if (missing) return { type: "error", message: missing };

  if (!hasBuffer()) {
    return {
      type: "error",
      message:
        "This browser is missing the Buffer runtime required to encode the Algorand payment. Reload the page and try again.",
    };
  }

  console.info("[x402] payment payload inputs", {
    payer: signer.address,
    payTo: args.quote.requirements.payTo,
    network: args.quote.requirements.network,
    asset: args.quote.requirements.asset,
    amount: args.quote.requirements.amount,
    scheme: args.quote.requirements.scheme,
    hasBuffer: hasBuffer(),
  });

  const blocked = await preflightPayer(args.quote.requirements, signer.address);
  if (blocked) return { type: "error", message: blocked };

  const client = new x402Client()
    .register(ALGORAND_TESTNET_NETWORK, new ExactAvmScheme(trackedSigner))
    .register(ALGORAND_MAINNET_NETWORK, new ExactAvmScheme(trackedSigner))
    .register(ALGORAND_TESTNET_CAIP2, new ExactAvmScheme(trackedSigner))
    .register(ALGORAND_MAINNET_CAIP2, new ExactAvmScheme(trackedSigner));

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  let response: Response;
  try {
    onPhase("SUBMITTING_PAYMENT");
    response = await fetchWithPayment(GENERATE_DECK_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ pitch, options }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
    // Surface the underlying failure in the console for diagnostics.
    console.error("[x402] payment failed", error);
    if (isPendingWalletRequest(message)) {
      return {
        type: "error",
        message:
          "Your wallet already has a pending transaction request. Open Pera and approve or reject it, then try again.",
      };
    }
    if (/reject|cancel|denied|closed/i.test(message)) {
      return { type: "error", message: "You cancelled the payment in your wallet." };
    }
    return {
      type: "error",
      message: describePaymentError(message, "The payment could not be completed."),
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
