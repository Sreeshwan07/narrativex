// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      // @algorandfoundation/algokit-utils (pulled in by @x402/avm) does
      // `import { Buffer } from "buffer"` inside its codecs. In the browser that
      // specifier resolves to an empty stub, so `Buffer` is undefined and the
      // Algorand transaction decoder fails with
      // "Cannot read properties of undefined (reading 'from')".
      // Redirect it to the userland `buffer` package — CLIENT ONLY, because that
      // package uses `require`, which throws in the SSR/worker runtime (which
      // already has a native Buffer).
      {
        name: "client-only-buffer-alias",
        // MUST run before Vite's node-builtin resolver, otherwise the
        // production client build silently swaps `buffer` for an empty
        // `__vite-browser-external` stub (dev worked because esbuild
        // pre-bundling resolved the npm package instead).
        enforce: "pre" as const,
        applyToEnvironment: (env: { name: string }) => env.name === "client",
        async resolveId(this: any, id: string) {
          if (id !== "buffer" && id !== "node:buffer") return null;
          const resolved = await this.resolve("buffer/", undefined, { skipSelf: true });
          return resolved?.id ?? null;
        },
      },

    ],
    optimizeDeps: { include: ["buffer"] },
  },
});


