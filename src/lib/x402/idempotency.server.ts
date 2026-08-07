/**
 * Idempotency / replay store for paid deck generations.
 *
 * Preview runs a single long-lived Node process, so a module-level Map was
 * enough. The published site runs on short-lived, horizontally-scaled workers:
 * a retry almost always lands on a *different* isolate with an empty Map, so
 * an already-paid generation would ask the user to pay again (and the
 * facilitator would reject the replayed payload). The durable store below
 * makes the published behaviour identical to preview.
 *
 * The in-memory layer is kept as a fast path for same-isolate retries.
 */

interface Entry<T> {
  value: T;
  at: number;
}

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 200;

const store = new Map<string, Entry<unknown>>();

function prune() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.at > TTL_MS) store.delete(key);
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

/**
 * Fast, process-local lookup.
 *
 * @param key - Client-supplied idempotency key.
 * @returns The stored value, or undefined when unknown/expired.
 */
export function getCompleted<T>(key: string): T | undefined {
  prune();
  const entry = store.get(key);
  return entry ? (entry.value as T) : undefined;
}

/**
 * Records a completed result in memory.
 *
 * @param key - Client-supplied idempotency key.
 * @param value - The result to remember.
 */
export function setCompleted<T>(key: string, value: T): void {
  store.set(key, { value, at: Date.now() });
  prune();
}

/**
 * Cross-isolate lookup: memory first, then the durable table. Never throws —
 * a storage outage degrades to "not found", which is the previous behaviour.
 *
 * @param key - Client-supplied idempotency key.
 * @returns The stored value, or undefined.
 */
export async function getCompletedDurable<T>(key: string): Promise<T | undefined> {
  if (!key) return undefined;
  const local = getCompleted<T>(key);
  if (local) return local;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("deck_receipts")
      .select("deck")
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error || !data?.deck) return undefined;
    const value = data.deck as T;
    setCompleted(key, value);
    return value;
  } catch (error) {
    console.error("[x402-server] durable idempotency read failed", String(error));
    return undefined;
  }
}

/**
 * Records a completed result in memory *and* durably, so a retry served by a
 * different published worker returns the paid deck instead of a new invoice.
 *
 * @param key - Client-supplied idempotency key.
 * @param value - The result to remember.
 */
export async function setCompletedDurable<T>(key: string, value: T): Promise<void> {
  if (!key) return;
  setCompleted(key, value);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("deck_receipts")
      .upsert(
        { idempotency_key: key, deck: value as never },
        { onConflict: "idempotency_key" },
      );
    if (error) console.error("[x402-server] durable idempotency write failed", error.message);
  } catch (error) {
    console.error("[x402-server] durable idempotency write threw", String(error));
  }
}
