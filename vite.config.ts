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
    // @algorandfoundation/algokit-utils (pulled in by @x402/avm) does
    // `import { Buffer } from "buffer"` inside its codecs. In the browser that
    // specifier resolves to an empty stub, so `Buffer` is undefined and the
    // Algorand transaction decoder fails with
    // "Cannot read properties of undefined (reading 'from')".
    // Map it to the userland `buffer` package — CLIENT ONLY. On the server the
    // userland shim throws "require is not defined", which 500s SSR/API routes.
    plugins: [
      {
        name: "client-only-buffer-alias",
        enforce: "pre" as const,
        async resolveId(this: any, source: string, importer: string | undefined) {
          if (this.environment?.name !== "client") return null;
          if (source !== "buffer" && source !== "node:buffer") return null;
          const resolved = await this.resolve("buffer/", importer, { skipSelf: true });
          return resolved?.id ?? null;
        },
      },
    ],

    optimizeDeps: { include: ["buffer"] },
  },
});

