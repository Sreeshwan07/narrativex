/**
 * Build/version identifier so we can confirm which bundle a given deployment
 * is actually running (Preview vs Published).
 */
export const BUILD_ID = "x402-buffer-fix-2026-08-08";

/** Logs the build stamp plus the Buffer resolution state once, in the browser. */
export function logBuildInfo(): void {
  if (typeof window === "undefined") return;
  const b = (globalThis as unknown as Record<string, unknown>)["Buffer"] as
    | { from?: unknown }
    | undefined;
  // eslint-disable-next-line no-console
  console.info(
    `[NarrativeX] build=${BUILD_ID} mode=${import.meta.env.MODE} bufferFrom=${typeof b?.from === "function"}`,
  );
}
