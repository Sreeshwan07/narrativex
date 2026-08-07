// Must run before any @x402 module: installs Buffer for the browser.
import "@/lib/x402/buffer-polyfill";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import type { ClientAvmSigner } from "@x402/avm";
import {
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
  isValidAlgorandAddress,
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

function rawChallenge(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates the complete x402 v2 AVM challenge before the AVM SDK is loaded.
 * The current AVM SDK does not receive a prebuilt transaction from the
 * facilitator: it builds one locally from these requirements and Algod's
 * suggested parameters. Every field used by that builder must therefore be
 * present and valid here.
 */
function validatePaymentRequired(value: unknown):
  | { valid: true; raw: PaymentRequired; requirements: PaymentRequirements }
  | { valid: false; reason: string } {
  if (!isRecord(value)) return { valid: false, reason: "response is not a JSON object" };
  if (value.x402Version !== 2)
    return { valid: false, reason: `unsupported x402Version ${String(value.x402Version)}` };
  if (!isRecord(value.resource) || typeof value.resource.url !== "string" || !value.resource.url)
    return { valid: false, reason: "resource.url is missing" };
  if (!Array.isArray(value.accepts) || value.accepts.length === 0)
    return { valid: false, reason: "accepts is missing or empty" };

  const supportedNetworks = new Set([
    ALGORAND_TESTNET_CAIP2,
    ALGORAND_MAINNET_CAIP2,
    ALGORAND_TESTNET_NETWORK,
    ALGORAND_MAINNET_NETWORK,
  ]);
  const candidate = value.accepts.find((item) => {
    if (!isRecord(item)) return false;
    return item.scheme === "exact" && typeof item.network === "string" && supportedNetworks.has(item.network);
  });
  if (!isRecord(candidate))
    return { valid: false, reason: "no supported Algorand exact payment requirement was provided" };
  if (typeof candidate.payTo !== "string" || !isValidAlgorandAddress(candidate.payTo))
    return { valid: false, reason: "payTo is missing or is not a valid Algorand address" };
  if (typeof candidate.asset !== "string" || !/^\d+$/.test(candidate.asset) || BigInt(candidate.asset) <= 0n)
    return { valid: false, reason: "asset is missing or is not a positive Algorand asset id" };
  if (typeof candidate.amount !== "string" || !/^\d+$/.test(candidate.amount) || BigInt(candidate.amount) <= 0n)
    return { valid: false, reason: "amount is missing or is not a positive atomic-unit value" };
  if (!Number.isInteger(candidate.maxTimeoutSeconds) || Number(candidate.maxTimeoutSeconds) <= 0)
    return { valid: false, reason: "maxTimeoutSeconds is missing or invalid" };
  if (!isRecord(candidate.extra))
    return { valid: false, reason: "extra is missing or is not an object" };
  if (
    candidate.extra.feePayer !== undefined &&
    (typeof candidate.extra.feePayer !== "string" || !isValidAlgorandAddress(candidate.extra.feePayer))
  ) {
    return { valid: false, reason: "extra.feePayer is not a valid Algorand address" };
  }

  return {
    valid: true,
    raw: value as unknown as PaymentRequired,
    requirements: candidate as unknown as PaymentRequirements,
  };
}

function toQuote(rawValue: unknown): PaymentQuote {
  console.info("[x402][facilitator] raw payment quote", rawValue);
  const validation = validatePaymentRequired(rawValue);
  if (!validation.valid) {
    const raw = rawChallenge(rawValue);
    console.error("[x402][facilitator] invalid payment quote", {
      reason: validation.reason,
      rawResponse: rawValue,
    });
    throw new Error(`Invalid x402 facilitator response: ${validation.reason}. Raw response: ${raw}`);
  }
  const { raw, requirements } = validation;
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
    console.info("[x402][step] quote_402", {
      hasPaymentRequiredHeader: Boolean(header),
      origin: window.location.origin,
    });
    if (header) {
      try {
        const rawQuote = decodePaymentRequiredHeader(header);
        return { type: "payment_required", quote: toQuote(rawQuote) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[x402] PAYMENT-REQUIRED header could not be decoded or validated", error);
        return { type: "error", message };
      }
    }
    const responseText = await response.text().catch(() => "");
    let body: unknown = null;
    try {
      body = responseText ? JSON.parse(responseText) : null;
    } catch {
      console.error("[x402][facilitator] non-JSON payment response", responseText);
    }
    if (body) {
      try {
        return { type: "payment_required", quote: toQuote(body) };
      } catch (error) {
        return {
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return {
      type: "error",
      message: `The server requested payment but returned no valid x402 quote. Raw response: ${responseText || "<empty>"}`,
    };
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

interface GenerateDeckResponse {
  success?: boolean;
  deck?: Deck;
  message?: string;
  error?: string;
}

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
  const rawValidation = validatePaymentRequired(quote.raw);
  if (!rawValidation.valid)
    return `Invalid x402 facilitator response: ${rawValidation.reason}. Raw response: ${rawChallenge(quote.raw)}`;
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
  if (rawValidation.requirements !== req) {
    const sameRequirement = rawChallenge(rawValidation.requirements) === rawChallenge(req);
    if (!sameRequirement)
      return "Payment payload error: the selected payment requirement no longer matches the raw x402 quote.";
  }
  return null;
}

/** The current AVM SDK returns signed transaction bytes in payload.paymentGroup. */
function describeInvalidSdkPayload(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return "Payment payload error: the x402 SDK returned no payment payload object.";
  }
  const payload = (value as { payload?: unknown }).payload;
  if (!payload || typeof payload !== "object") {
    return "Payment payload error: the x402 SDK response has no payload object.";
  }
  const paymentGroup = (payload as { paymentGroup?: unknown }).paymentGroup;
  if (!Array.isArray(paymentGroup) || paymentGroup.length === 0) {
    return "Payment payload error: the x402 SDK response contains no Algorand paymentGroup transactions.";
  }
  if (paymentGroup.some((transaction) => typeof transaction !== "string" || !transaction)) {
    return "Payment payload error: the x402 SDK returned an invalid Algorand transaction in paymentGroup.";
  }
  return null;
}

/**
 * Single in-flight payment guard. Pera (and every WalletConnect wallet) allows
 * exactly one pending transaction request; a second one fails with code 4100.
 */
let inFlightPayment: Promise<PayResult> | null = null;
let walletSigningRequest: Promise<(Uint8Array | null)[]> | null = null;

/** True while a wallet payment request is still pending. */
export function isPaymentInFlight(): boolean {
  return inFlightPayment !== null;
}

/** Recognises Pera's "another request in progress" error (code 4100). */
function isPendingWalletRequest(message: string): boolean {
  return /\b4100\b/.test(message) || /another transaction request in progress/i.test(message);
}

/**
 * Decodes the base64 PAYMENT-REQUIRED challenge on a failing response so the
 * facilitator's exact rejection reason can be shown and logged.
 *
 * @param response - Response returned by the protected endpoint.
 * @returns The reason string, or null when absent/undecodable.
 */
function decodeChallengeError(response: Response): string | null {
  const header = response.headers.get("PAYMENT-REQUIRED");
  if (!header) return null;
  try {
    const decoded = decodePaymentRequiredHeader(header) as PaymentRequired & { error?: string };
    return typeof decoded.error === "string" && decoded.error ? decoded.error : null;
  } catch (error) {
    console.warn("[x402] could not decode PAYMENT-REQUIRED header on failure", error);
    return null;
  }
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
      // In @x402/avm v2 the scheme supplies encoded Uint8Array transactions,
      // not objects with a `from` property. Log and validate the actual SDK
      // callback value before the wallet adapter touches it.
      console.info("[x402][sdk] signTransactions response", { txns, indexes });
      if (!Array.isArray(txns) || txns.length === 0) {
        throw new Error("Payment payload error: x402 produced no Algorand transaction to sign.");
      }
      const invalidIndex = txns.findIndex(
        (txn) => !(txn instanceof Uint8Array) || txn.byteLength === 0,
      );
      if (invalidIndex !== -1) {
        console.error("[x402][sdk] unexpected transaction object", {
          invalidIndex,
          transaction: txns[invalidIndex],
          transactions: txns,
        });
        throw new Error(
          `Payment payload error: x402 returned an invalid transaction at index ${invalidIndex}.`,
        );
      }
      if (!Array.isArray(indexes) || indexes.length === 0) {
        console.error("[x402][sdk] no wallet signing indexes", { txns, indexes });
        throw new Error("Payment payload error: x402 did not identify a transaction for this wallet to sign.");
      }
      if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= txns.length)) {
        console.error("[x402][sdk] invalid wallet signing indexes", { txns, indexes });
        throw new Error("Payment payload error: x402 returned invalid transaction signing indexes.");
      }
      console.info("[x402] transactions to sign", txns.length, "indexes", indexes);
      onPhase("WALLET_PENDING");
      if (walletSigningRequest) {
        console.info("[x402] wallet signing request already pending — awaiting it");
        return walletSigningRequest;
      }
      walletSigningRequest = signer.signTransactions(txns, indexes);
      try {
        const signed = await walletSigningRequest;
        console.info("[x402] wallet approved transaction", {
          signedTransactions: signed.filter(Boolean).length,
        });
        onPhase("SUBMITTING_PAYMENT");
        return signed;
      } finally {
        walletSigningRequest = null;
      }
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

  // Load the SDK only after the browser Buffer polyfill has been installed.
  // Static ESM imports are evaluated before this module body and can otherwise
  // leave AVM's internal Buffer.from unavailable in production chunks.
  const [{ x402Client, x402HTTPClient }, { ExactAvmScheme }] = await Promise.all([
    import("@x402/fetch"),
    import("@x402/avm/exact/client"),
  ]);

  const client = new x402Client()
    .register(ALGORAND_TESTNET_NETWORK, new ExactAvmScheme(trackedSigner))
    .register(ALGORAND_MAINNET_NETWORK, new ExactAvmScheme(trackedSigner))
    .register(ALGORAND_TESTNET_CAIP2, new ExactAvmScheme(trackedSigner))
    .register(ALGORAND_MAINNET_CAIP2, new ExactAvmScheme(trackedSigner));

  const httpClient = new x402HTTPClient(client);

  let step = "create_payment_payload";
  let response: Response;
  let paymentHeaders: Record<string, string> = {};
  try {
    // Full, unmutated quote as returned by the server, logged before the SDK
    // touches it, so an invalid facilitator response is visible verbatim.
    console.info("[x402][step] create_payment_payload — one payload from the existing quote", {
      quote: JSON.parse(JSON.stringify(args.quote.raw)),
      requirements: args.quote.requirements,
      bufferModuleAvailable: hasBuffer(),
    });
    const validation = validatePaymentRequired(args.quote.raw);
    if (!validation.valid) {
      throw new Error(
        `Invalid x402 facilitator response: ${validation.reason}. Raw response: ${rawChallenge(args.quote.raw)}`,
      );
    }
    // Pass a fresh, single-option challenge to prevent the SDK selector from
    // choosing a different accept entry than the one already validated above.
    const validatedQuote: PaymentRequired = {
      ...validation.raw,
      accepts: [{ ...validation.requirements, extra: { ...validation.requirements.extra } }],
    };
    console.info("[x402][sdk] validated payment requirement", validatedQuote.accepts[0]);
    const paymentPayload = await client.createPaymentPayload(validatedQuote);
    console.info("[x402][sdk] createPaymentPayload response", paymentPayload);
    const invalidPayload = describeInvalidSdkPayload(paymentPayload);
    if (invalidPayload) {
      console.error("[x402][sdk] unexpected createPaymentPayload response", paymentPayload);
      throw new Error(invalidPayload);
    }
    paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
    console.info("[x402][step] payload_created", {
      x402Version: paymentPayload.x402Version,
      payer: signer.address,
      network: args.quote.requirements.network,
      paymentHeaderNames: Object.keys(paymentHeaders),
      paymentHeaderLengths: Object.fromEntries(
        Object.entries(paymentHeaders).map(([k, v]) => [k, String(v).length]),
      ),
    });

    step = "submit_paid_request";
    onPhase("SUBMITTING_PAYMENT");
    console.info("[x402][step] submit_paid_request", {
      url: new URL(GENERATE_DECK_PATH, window.location.origin).toString(),
      headers: Object.keys({ "content-type": "", "Idempotency-Key": "", ...paymentHeaders }),
    });
    response = await fetch(GENERATE_DECK_PATH, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": idempotencyKey,
        ...paymentHeaders,
      },
      body: JSON.stringify({ pitch, options }),
    });
    console.info("[x402][step] response_received", {
      status: response.status,
      hasPaymentRequiredHeader: Boolean(response.headers.get("PAYMENT-REQUIRED")),
      hasPaymentResponseHeader: Boolean(response.headers.get("PAYMENT-RESPONSE")),
    });
  } catch (error) {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
    console.error(`[x402][step] FAILED at ${step}`, error);
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
      message: `${describePaymentError(message, "The payment could not be completed.")} (step: ${step})`,
    };
  }

  step = "verify_and_settle";
  onPhase("VERIFYING_PAYMENT");
  console.info("[x402][step] verify_and_settle — awaiting facilitator + Algorand settlement");

  const responseText = await response.text().catch(() => "");
  let body: GenerateDeckResponse | null = null;
  try {
    body = responseText ? (JSON.parse(responseText) as GenerateDeckResponse) : null;
  } catch {
    console.error("[x402][step] backend returned a non-JSON response", {
      status: response.status,
      body: responseText.slice(0, 500),
    });
  }

  if (!response.ok || !body?.success || !body.deck) {
    // A second 402 means the facilitator rejected the signed payload (or a
    // proxy stripped the signature header). The real reason travels base64 in
    // PAYMENT-REQUIRED, so decode it rather than reporting a generic failure.
    const challengeReason = decodeChallengeError(response);
    const backendDetail = body?.message ?? body?.error ?? challengeReason ?? responseText.trim();
    console.error("[x402][step] FAILED at verify_and_settle", {
      status: response.status,
      error: body?.error,
      message: body?.message,
      challengeReason,
      sentPaymentHeaders: Object.keys(paymentHeaders),
      response: responseText.slice(0, 500),
    });
    if (response.status === 402 && Object.keys(paymentHeaders).length === 0) {
      return {
        type: "error",
        message:
          "The signed payment header never reached the server (it was stripped in transit). Reload and try again.",
      };
    }
    return {
      type: "error",
      message: backendDetail
        ? `Payment rejected at verification (HTTP ${response.status}): ${String(backendDetail).slice(0, 500)}`
        : `Payment request failed with HTTP ${response.status} at step ${step}.`,
    };
  }


  let settlement: PaymentSettlement | null = null;
  const settleHeader =
    response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
  if (settleHeader) {
    try {
      const decoded = decodePaymentResponseHeader(settleHeader);
      if (decoded.transaction) {
        settlement = {
          transactionId: decoded.transaction,
          network: networkLabel(decoded.network ?? ALGORAND_TESTNET_CAIP2),
        };
        console.info("[x402] Algorand payment confirmed", {
          transactionId: decoded.transaction,
          network: decoded.network,
        });
      }
    } catch (error) {
      console.warn("[x402] payment succeeded but settlement header could not be decoded", error);
    }
  }

  if (!settleHeader) {
    console.warn("[x402] successful response did not include PAYMENT-RESPONSE settlement details");
  }

  onPhase("PAYMENT_SUCCESS");
  return { type: "success", deck: body.deck, settlement };
}
