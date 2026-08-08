// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { createRequire } from "node:module";

// @algorandfoundation/algokit-utils (pulled in by @x402/avm) does
// `import { Buffer } from "buffer"` inside its codecs. In the browser that
// specifier resolves to Vite's empty `__vite-browser-external` stub, so
// `Buffer` is undefined and the Algorand transaction encoder fails with
// "Cannot read properties of undefined (reading 'from')".
//
// Dev hid this: esbuild dep pre-bundling resolved the npm `buffer` package,
// so only the production (published) client bundle got the empty stub.
// The alias below is scoped to the CLIENT environment only, because the npm
// `buffer` package uses `require`, which throws in the SSR/worker runtime
// (which already provides a native Buffer).
const bufferPolyfillPath = createRequire(import.meta.url).resolve("buffer/");

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    environments: {
      client: {
        resolve: {
          alias: [
            { find: /^buffer$/, replacement: bufferPolyfillPath },
            { find: /^node:buffer$/, replacement: bufferPolyfillPath },
          ],
        },
      },
    },
    optimizeDeps: { include: ["buffer"] },
  },
});



