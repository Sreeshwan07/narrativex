import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

/**
 * Single server-only AI provider resolution.
 *
 * Selection order:
 *  1. LOVABLE_API_KEY  -> Lovable AI Gateway (used inside Lovable)
 *  2. OPENAI_API_KEY   -> OpenAI production API (used on Vercel)
 *  3. none             -> configuration error
 *
 * Never import this from browser code: it reads process.env secrets.
 */

export type AIProviderName = "lovable" | "openai" | "none";

const LOVABLE_DEFAULT_MODEL = "google/gemini-3.6-flash";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export interface AIStatus {
  configured: boolean;
  provider: AIProviderName;
  model: string;
}

/** Secret-free status snapshot for diagnostics. */
export function getAIStatus(): AIStatus {
  const configured = env("AI_MODEL");
  if (env("LOVABLE_API_KEY")) {
    return { configured: true, provider: "lovable", model: configured || LOVABLE_DEFAULT_MODEL };
  }
  if (env("OPENAI_API_KEY")) {
    return { configured: true, provider: "openai", model: configured || OPENAI_DEFAULT_MODEL };
  }
  return { configured: false, provider: "none", model: "" };
}

export class AIConfigurationError extends Error {}

export interface ResolvedAIProvider {
  provider: AIProviderName;
  modelId: string;
  /** Language model ready to pass to the AI SDK. */
  model: ReturnType<ReturnType<typeof createOpenAICompatible>>;
}

/**
 * Resolves the server-side AI provider and model.
 *
 * @throws AIConfigurationError when no provider key is present.
 */
export function getAIProvider(): ResolvedAIProvider {
  const status = getAIStatus();

  if (status.provider === "lovable") {
    const gateway = createLovableAiGatewayProvider(env("LOVABLE_API_KEY"), undefined, {
      structuredOutputs: true,
    });
    return { provider: "lovable", modelId: status.model, model: gateway(status.model) };
  }

  if (status.provider === "openai") {
    const openai = createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      // Server-only: the key never leaves this module.
      apiKey: env("OPENAI_API_KEY"),
      supportsStructuredOutputs: true,
    });
    return { provider: "openai", modelId: status.model, model: openai(status.model) };
  }

  throw new AIConfigurationError(
    "AI is not configured. Add OPENAI_API_KEY to the production environment variables.",
  );
}
