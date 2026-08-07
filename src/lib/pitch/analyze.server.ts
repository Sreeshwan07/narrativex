import { streamText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import {
  ANALYZE_LIMITS,
  emptyPitch,
  pitchSchema,
  type AnalyzeInput,
  type AnalyzeResult,
  type Pitch,
} from "@/lib/pitch/schema";

const MODEL = "google/gemini-3.6-flash";

const SYSTEM_PROMPT = `You are an analyst who turns technical project documentation into investor-ready pitch material.

EVIDENCE MODEL — classify every factual business claim before you write it:
A. Explicitly supported — stated in the documentation. Write it plainly.
B. Reasonable interpretation — a fair reading of what the documentation implies. You may write it, but keep it qualitative and add a confidence note naming the field and what was inferred.
C. Missing — no basis in the documentation. Return "" or [] for that field. Never fill the gap.

RULES — these are absolute:
1. Use ONLY information supported by, or reasonably interpretable from, the supplied documentation.
2. NEVER invent quantitative claims of any kind: market sizes, revenue, customer or user counts, funding, growth rates, partnerships, traction metrics, or named competitors. If a number is not in the documentation, it does not exist.
3. market_opportunity: if the documentation contains quantitative market data (market size, spend, segment figures), summarise it and set market_data_available to true. Otherwise write a qualitative opportunity statement grounded in the described problem and users, and set market_data_available to false. Never state a figure to justify the opportunity.
4. traction and business_model: category C unless the documentation states them. Empty is always better than invented.
5. confidence_notes: brief notes (under 20 words each) for sections that were incomplete or inferred — e.g. "Business model inferred from open-source positioning; not stated." Leave empty when everything was explicit.
5b. investor_questions: exactly 3 concise questions (under 18 words each) an investor would most likely ask about THIS project — target the weakest or least-evidenced parts of the pitch. Never phrase them as claims.
6. You may rephrase technical language into clear, confident, investor-friendly prose — rewriting is allowed, inventing is not.
7. Keep prose fields concise: 1-3 sentences. Keep list items short (under 15 words each), maximum 6 items per list.
8. Do not include markdown, code fences, or commentary — only the structured fields.`;

function clampList(values: string[], max = 6): string[] {
  return values
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalize(pitch: Pitch): Pitch {
  const market_opportunity = pitch.market_opportunity.trim();
  return {
    ...emptyPitch,
    ...pitch,
    project_name: pitch.project_name.trim(),
    tagline: pitch.tagline.trim(),
    problem: pitch.problem.trim(),
    solution: pitch.solution.trim(),
    market_opportunity,
    // A "quantitative data available" claim is meaningless without an actual statement.
    market_data_available: market_opportunity ? pitch.market_data_available : false,
    business_model: pitch.business_model.trim(),
    traction: pitch.traction.trim(),
    call_to_action: pitch.call_to_action.trim(),
    target_users: clampList(pitch.target_users),
    key_features: clampList(pitch.key_features),
    competitive_advantage: clampList(pitch.competitive_advantage),
    technology: clampList(pitch.technology, 10),
    roadmap: clampList(pitch.roadmap),
    confidence_notes: clampList(pitch.confidence_notes),
    investor_questions: clampList(pitch.investor_questions, 3),
  };
}


/** Server-only: analyses README/documentation text into a validated pitch object. */
export async function analyzeReadme({ content }: AnalyzeInput): Promise<AnalyzeResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return { success: false, error: "AI is not configured for this project." };
  }

  const source = content.trim().slice(0, ANALYZE_LIMITS.maxChars);
  const gateway = createLovableAiGatewayProvider(apiKey, undefined, { structuredOutputs: true });

  try {
    // Streamed on the wire so long documents never hit the platform request timeout,
    // but consumed server-side because this endpoint is one-shot.
    const result = streamText({
      model: gateway(MODEL),
      system: SYSTEM_PROMPT,
      output: Output.object({ schema: pitchSchema }),
      prompt: `Analyse the following project documentation and produce the structured pitch fields.\n\n---\n${source}\n---`,
    });

    const output = await result.output;
    const parsed = pitchSchema.safeParse(output);
    if (!parsed.success) {
      return { success: false, error: "The AI returned an unexpected response. Please try again." };
    }
    return { success: true, pitch: normalize(parsed.data) };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return {
        success: false,
        error: "The AI could not structure this documentation. Try a more descriptive README.",
      };
    }

    const message = error instanceof Error ? error.message : "";
    console.error("analyzeReadme failed:", message);

    if (message.includes("429")) {
      return { success: false, error: "Too many requests right now. Please retry in a moment." };
    }
    if (message.includes("402")) {
      return { success: false, error: "AI credits are exhausted. Add credits to continue." };
    }
    return { success: false, error: "Analysis failed. Please try again." };
  }
}
