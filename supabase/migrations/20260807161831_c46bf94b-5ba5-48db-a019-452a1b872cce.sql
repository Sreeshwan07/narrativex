CREATE TABLE public.deck_receipts (
  idempotency_key TEXT PRIMARY KEY,
  deck JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.deck_receipts TO service_role;
ALTER TABLE public.deck_receipts ENABLE ROW LEVEL SECURITY;