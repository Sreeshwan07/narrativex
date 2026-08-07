import { createServerFn } from "@tanstack/react-start";
import { pitchSchema } from "@/lib/pitch/schema";
import { z } from "zod";
import type { GenerateDeckResult } from "@/lib/deck/schema";

const inputSchema = z.object({ pitch: pitchSchema });

/**
 * POST /generate-deck — modular deck generation boundary. A future protected
 * (x402) endpoint can wrap this without touching the mapping or the UI.
 */
export const generateDeckFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<GenerateDeckResult> => {
    const { buildDeck } = await import("@/lib/deck/build");
    try {
      return { success: true, deck: buildDeck(data.pitch) };
    } catch {
      return { success: false, error: "Deck generation failed. Please try again." };
    }
  });
