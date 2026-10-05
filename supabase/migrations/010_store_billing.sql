-- Store billing (Google Play Billing / Apple App Store) entitlements.
--
-- RevenueCat is the source of truth for in-app purchases. These columns record the
-- synced store state alongside the existing Stripe columns so that the gating in
-- src/lib/subscription.ts (`plan = 'pro'` and `status` in active/trialing) keeps
-- working unchanged for both web and mobile.

-- ---------------------------------------------------------------------------
-- Enforce one subscription row per user.
--
-- This was already assumed by the codebase but never enforced:
--   * src/lib/subscription.ts uses .maybeSingle(), which errors on duplicates.
--   * src/app/api/webhooks/stripe/route.ts upserts with { onConflict: 'user_id' },
--     which PostgREST rejects without a unique index -- so the Stripe
--     checkout.session.completed upsert silently failed to activate Pro.
--
-- Collapse duplicates onto the single best row before adding the index, so the
-- migration cannot fail on existing data. "Best" prefers a live Pro row, then
-- the most recent row.
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE WHEN plan = 'pro' AND status IN ('active', 'trialing') THEN 1 ELSE 0 END DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.subscriptions
  WHERE user_id IS NOT NULL
)
DELETE FROM public.subscriptions s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_key
  ON public.subscriptions(user_id);

-- ---------------------------------------------------------------------------
-- Store billing columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_provider TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_app_user_id TEXT,
  ADD COLUMN IF NOT EXISTS store TEXT,
  ADD COLUMN IF NOT EXISTS store_product_id TEXT,
  ADD COLUMN IF NOT EXISTS store_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS store_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS entitlement_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS management_url TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_revenuecat_app_user_id
  ON public.subscriptions(revenuecat_app_user_id);

-- ---------------------------------------------------------------------------
-- Webhook delivery ledger.
--
-- RevenueCat delivers at least once and retries up to 5 times, so processing
-- must be idempotent. The event id is the primary key; inserts use
-- ON CONFLICT DO NOTHING to claim an event exactly once.
--
-- No RLS policies are created deliberately: this table is service-role only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.revenuecat_webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  app_user_id TEXT,
  environment TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  outcome TEXT
);

ALTER TABLE public.revenuecat_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_received_at
  ON public.revenuecat_webhook_events(received_at);