import { createFileRoute } from "@tanstack/react-router";

/**
 * Deployment health + configuration check. Reports only whether values are
 * present — never the values themselves.
 */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const { readX402Config, toPublicStatus } = await import("@/lib/x402/config.server");
        const { getAIStatus } = await import("@/lib/ai/provider.server");
        const status = toPublicStatus(readX402Config());
        const ai = getAIStatus();
        return Response.json(
          {
            status: "ok",
            service: "NarrativeX",
            aiConfigured: ai.configured,
            aiProvider: ai.provider,
            aiModel: ai.model,
            x402Configured: status.configured,
            algorandNetwork: status.network,
            algorandTestnetConfigured: status.algorandTestnetConfigured,
            paymentAssetConfigured: status.paymentAssetConfigured,
            receiverConfigured: status.receiverConfigured,
            facilitatorConfigured: status.facilitatorConfigured,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },

    },
  },
});
