import { Buffer } from "node:buffer";
import {
  FacilitatorResponseError,
  HTTPFacilitatorClient,
  getFacilitatorResponseError,
  withPrivateCacheControl,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type { HTTPAdapter, HTTPRequestContext } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { readX402Config, type X402Config } from "@/lib/x402/config.server";

/**
 * Framework-agnostic HTTP adapter over the Web `Request` used by TanStack
 * Start server routes. Mirrors the official Hono/Next adapters.
 */
class FetchAdapter implements HTTPAdapter {
  private readonly url: URL;

  /**
   * @param request - Incoming request.
   * @param body - Already-parsed JSON body, if any.
   */
  constructor(
    private readonly request: Request,
    private readonly body: unknown,
  ) {
    this.url = new URL(request.url);
  }

  /**
   * @param name - Header name.
   * @returns The header value, or undefined.
   */
  getHeader(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined;
  }

  /** @returns The HTTP method. */
  getMethod(): string {
    return this.request.method;
  }

  /** @returns The request path. */
  getPath(): string {
    return this.url.pathname;
  }

  /** @returns The absolute request URL. */
  getUrl(): string {
    return this.request.url;
  }

  /** @returns The Accept header. */
  getAcceptHeader(): string {
    return this.request.headers.get("Accept") ?? "";
  }

  /** @returns The User-Agent header. */
  getUserAgent(): string {
    return this.request.headers.get("User-Agent") ?? "";
  }

  /** @returns All query parameters. */
  getQueryParams(): Record<string, string | string[]> {
    return Object.fromEntries(this.url.searchParams.entries());
  }

  /**
   * @param name - Query parameter name.
   * @returns The parameter value, or undefined.
   */
  getQueryParam(name: string): string | string[] | undefined {
    return this.url.searchParams.get(name) ?? undefined;
  }

  /** @returns The parsed request body. */
  getBody(): unknown {
    return this.body;
  }
}

export class X402ConfigurationError extends Error {}

let cached: { key: string; server: x402HTTPResourceServer; initialized: boolean } | null = null;

/**
 * Builds (and memoises) the x402 HTTP resource server for the protected route.
 *
 * @param routePattern - Route pattern to protect, e.g. `POST /api/public/generate-deck`.
 * @param config - Resolved x402 configuration.
 * @returns The configured resource server.
 */
function getResourceServer(routePattern: string, config: X402Config): x402HTTPResourceServer {
  const key = `${routePattern}|${config.network}|${config.payTo}|${config.facilitatorUrl}|${config.price}|${config.asset}`;
  if (cached?.key === key) return cached.server;

  const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitator).register(
    config.network,
    new ExactAvmScheme(),
  );

  const httpServer = new x402HTTPResourceServer(resourceServer, {
    [routePattern]: {
      accepts: {
        scheme: "exact",
        network: config.network,
        payTo: config.payTo,
        price: { asset: config.asset, amount: toAtomicUsdc(config.priceValue) },
        maxTimeoutSeconds: 300,
      },
      description: "PitchForge investor deck generation",
      serviceName: "PitchForge",
      mimeType: "application/json",
    },
  });

  cached = { key, server: httpServer, initialized: false };
  return httpServer;
}

/**
 * Converts a decimal USD/USDC amount to atomic units (6 decimals).
 *
 * @param value - Decimal amount, e.g. "0.10".
 * @returns Atomic amount string, e.g. "100000".
 */
function toAtomicUsdc(value: string): string {
  return BigInt(Math.round(Number.parseFloat(value) * 1_000_000)).toString();
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body ?? {}), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export interface ProtectedHandlerResult {
  /** JSON body returned to the client when payment succeeds. */
  body: unknown;
  /** Optional status override (defaults to 200). */
  status?: number;
}

/**
 * Runs `handler` behind the official x402 resource-server middleware.
 *
 * Unpaid requests receive a genuine HTTP 402 with x402 payment requirements.
 * The handler only runs after the facilitator has verified the payment, and
 * settlement happens afterwards — a settlement failure never returns a deck.
 *
 * @param request - Incoming request.
 * @param options - Route pattern, parsed body and the protected handler.
 * @param options.routePattern - x402 route pattern, e.g. "POST /api/public/generate-deck".
 * @param options.body - Parsed JSON request body.
 * @param options.skipPayment - Optional predicate granting access without payment (idempotent retries).
 * @param options.handler - The protected work to perform once payment is verified.
 * @returns The HTTP response, including settlement headers when paid.
 */
export async function withX402(
  request: Request,
  options: {
    routePattern: string;
    body: unknown;
    skipPayment?: () => boolean;
    handler: () => Promise<ProtectedHandlerResult>;
  },
): Promise<Response> {
  const config = readX402Config();
  if (config.missing.length > 0) {
    return jsonResponse(
      {
        error: "server_not_configured",
        message:
          "PitchForge payments are not configured on this server. Missing environment variables are listed below.",
        missing: config.missing,
      },
      503,
    );
  }

  if (options.skipPayment?.()) {
    const result = await options.handler();
    return jsonResponse(result.body, result.status ?? 200);
  }

  const adapter = new FetchAdapter(request, options.body);
  const context: HTTPRequestContext = {
    adapter,
    path: adapter.getPath(),
    method: request.method,
    ...(adapter.getHeader("payment-signature") || adapter.getHeader("x-payment")
      ? { paymentHeader: adapter.getHeader("payment-signature") ?? adapter.getHeader("x-payment")! }
      : {}),
  };

  const httpServer = getResourceServer(options.routePattern, config);

  if (cached && !cached.initialized) {
    try {
      await httpServer.initialize();
      cached.initialized = true;
    } catch (error) {
      console.error("x402 facilitator init failed:", config.facilitatorUrl, error);

      const facilitatorError = getFacilitatorResponseError(error);
      return jsonResponse(
        {
          error: "facilitator_unavailable",
          message:
            facilitatorError?.message ??
            "The x402 facilitator could not be reached. Payment cannot be verified right now.",
        },
        502,
      );
    }
  }

  let processed;
  try {
    processed = await httpServer.processHTTPRequest(context);
  } catch (error) {
    if (error instanceof FacilitatorResponseError) {
      return jsonResponse({ error: "facilitator_error", message: error.message }, 502);
    }
    throw error;
  }

  if (processed.type === "payment-error") {
    const { response } = processed;
    return jsonResponse(response.body, response.status, response.headers);
  }

  if (processed.type === "no-payment-required") {
    const result = await options.handler();
    return jsonResponse(result.body, result.status ?? 200);
  }

  // payment-verified — run the protected work, then settle.
  const { cancellationDispatcher, paymentPayload, paymentRequirements, declaredExtensions } =
    processed;

  let result: ProtectedHandlerResult;
  try {
    result = await options.handler();
  } catch (error) {
    await cancellationDispatcher.cancel({ reason: "handler_threw", error });
    return jsonResponse(
      {
        error: "generation_failed",
        message: "Deck generation failed after payment authorization; the payment was not settled.",
      },
      500,
    );
  }

  const responseBody = Buffer.from(JSON.stringify(result.body ?? {}));

  try {
    const settle = await httpServer.processSettlement(
      paymentPayload,
      paymentRequirements,
      declaredExtensions,
      { request: context, responseBody, responseHeaders: { "content-type": "application/json" } },
    );

    if (!settle.success) {
      return jsonResponse(settle.response.body, settle.response.status, settle.response.headers);
    }

    return jsonResponse(result.body, result.status ?? 200, {
      ...settle.headers,
      "Cache-Control": withPrivateCacheControl(null),
    });
  } catch (error) {
    if (error instanceof FacilitatorResponseError) {
      return jsonResponse({ error: "settlement_failed", message: error.message }, 502);
    }
    console.error("x402 settlement error:", error);
    return jsonResponse(
      { error: "settlement_failed", message: "Payment settlement failed. You were not charged." },
      402,
    );
  }
}
