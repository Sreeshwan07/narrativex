import {
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  USDC_MAINNET_ASA_ID,
  USDC_TESTNET_ASA_ID,
  isValidAlgorandAddress,
} from "@x402/avm";
import type { Network } from "@x402/core/types";

/**
 * Server-only x402 configuration. All values come from the environment so the
 * network can move from TestNet to MainNet without a code change. Nothing
 * secret is ever returned to the browser — the diagnostic endpoints only report
 * whether a value is present.
 */
export interface X402Config {
  /** CAIP-2 network identifier from the official SDK constants. */
  network: Network;
  networkLabel: "Algorand TestNet" | "Algorand MainNet";
  /** USDC ASA id from the official SDK constants. */
  asset: string;
  assetLabel: string;
  /** Public Algorand address receiving PitchForge payments. */
  payTo: string;
  facilitatorUrl: string;
  /** Price as a USD money string, e.g. "$0.10". */
  price: string;
  priceValue: string;
  missing: string[];
}

const DEFAULT_PRICE = "0.10";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Reads x402 configuration from the environment.
 *
 * @returns The resolved configuration plus a list of missing/invalid variables.
 */
export function readX402Config(): X402Config {
  const missing: string[] = [];

  const networkEnv = (env("X402_NETWORK") || env("ALGORAND_NETWORK") || "testnet").toLowerCase();
  const isMainnet = networkEnv === "mainnet";

  const payTo = env("AVM_ADDRESS");
  if (!payTo) missing.push("AVM_ADDRESS");
  else if (!isValidAlgorandAddress(payTo)) missing.push("AVM_ADDRESS (not a valid Algorand address)");

  const facilitatorUrl = env("FACILITATOR_URL");
  if (!facilitatorUrl) missing.push("FACILITATOR_URL");

  const rawPrice = env("PITCH_DECK_PRICE") || DEFAULT_PRICE;
  const priceValue = Number.parseFloat(rawPrice.replace(/^\$/, ""));
  const safePrice = Number.isFinite(priceValue) && priceValue > 0 ? priceValue : Number(DEFAULT_PRICE);

  return {
    network: (isMainnet ? ALGORAND_MAINNET_CAIP2 : ALGORAND_TESTNET_CAIP2) as Network,
    networkLabel: isMainnet ? "Algorand MainNet" : "Algorand TestNet",
    asset: isMainnet ? USDC_MAINNET_ASA_ID : USDC_TESTNET_ASA_ID,
    assetLabel: isMainnet ? "USDC (MainNet)" : "USDC (TestNet)",
    payTo,
    facilitatorUrl,
    price: `$${safePrice.toFixed(2)}`,
    priceValue: safePrice.toFixed(2),
    missing,
  };
}

/**
 * Public, secret-free configuration snapshot for the diagnostic endpoints.
 *
 * @param config - Resolved x402 configuration.
 * @returns A JSON-safe status object with no secret values.
 */
export function toPublicStatus(config: X402Config) {
  return {
    configured: config.missing.length === 0,
    network: config.networkLabel,
    networkId: config.network,
    price: config.price,
    asset: config.assetLabel,
    receiverConfigured: Boolean(config.payTo) && !config.missing.some((m) => m.startsWith("AVM_ADDRESS")),
    facilitatorConfigured: Boolean(config.facilitatorUrl),
    missing: config.missing,
  };
}
