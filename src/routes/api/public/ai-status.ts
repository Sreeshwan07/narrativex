import { createFileRoute } from "@tanstack/react-router";

/**
 * AI configuration diagnostics. Reports only presence and selection —
 * never keys, headers, or secret values.
 */
export const Route = createFileRoute("/api/public/ai-status")({
  server: {
    handlers: {
      GET: async () => {
        const { getAIStatus } = await import("@/lib/ai/provider.server");
        return Response.json(getAIStatus(), { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
