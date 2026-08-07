-- deck_receipts is an internal, backend-only replay store for paid deck
-- generations. It is written and read exclusively by the trusted server
-- (service role) inside the x402 payment flow. No browser client should ever
-- reach it, so RLS stays enabled with zero policies (default deny) and the
-- API roles get no privileges at all.

REVOKE ALL ON TABLE public.deck_receipts FROM anon, authenticated;
GRANT ALL ON TABLE public.deck_receipts TO service_role;

ALTER TABLE public.deck_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_receipts FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.deck_receipts IS
  'Backend-only x402 payment replay store. Accessed solely by the service role from server code; RLS enabled with no policies so anon/authenticated clients are denied by default.';