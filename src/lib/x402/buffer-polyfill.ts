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

type GlobalWithBuffer = typeof globalThis & { Buffer?: unknown };

const g = globalThis as GlobalWithBuffer;

if (typeof g.Buffer === "undefined" || typeof (g.Buffer as { from?: unknown })?.from !== "function") {
  g.Buffer = BufferPolyfill;
}

/** True when a usable Buffer implementation is available. */
export function hasBuffer(): boolean {
  return typeof (globalThis as GlobalWithBuffer).Buffer !== "undefined";
}
