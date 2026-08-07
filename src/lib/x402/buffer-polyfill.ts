/**
 * The `@x402/avm` client encodes Algorand transactions with `Buffer.from(...)`.
 * In the browser Vite externalises the Node `buffer` builtin, so `Buffer` is
 * undefined at runtime and payload creation fails with
 * "Cannot read properties of undefined (reading 'from')".
 *
 * Importing "buffer/" (trailing slash) resolves the npm polyfill package rather
 * than the Node builtin, and we install it on globalThis before any x402 code
 * runs. Server runtimes already provide Buffer, so this is a no-op there.
 */
import { Buffer as BufferPolyfill } from "buffer/";

const g = globalThis as unknown as Record<string, unknown>;

const existing = g["Buffer"] as { from?: unknown } | undefined;

if (!existing || typeof existing.from !== "function") {
  g["Buffer"] = BufferPolyfill;
}

/** True when a usable Buffer implementation is available. */
export function hasBuffer(): boolean {
  const b = (globalThis as unknown as Record<string, unknown>)["Buffer"] as
    | { from?: unknown }
    | undefined;
  return typeof b?.from === "function";
}
