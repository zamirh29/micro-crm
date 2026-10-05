import crypto from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

const RC_API_BASE = "https://api.revenuecat.com/v1"

/**
 * RevenueCat entitlement that maps to the Pro plan. Override with
 * REVENUECAT_PRO_ENTITLEMENT_ID if the dashboard entitlement is named differently.
 */
export const RC_PRO_ENTITLEMENT = process.env.REVENUECAT_PRO_ENTITLEMENT_ID ?? "pro"

/**
 * Webhook events that can change what the user is entitled to.
 *
 * Anything outside this set is acknowledged and ignored. We deliberately do not
 * derive state from the individual payloads: per
 * https://www.revenuecat.com/docs/integrations/webhooks, the recommended approach is
 * to re-read the customer from the REST API on every relevant event so all events
 * share one code path and stay robust to new fields and event types.
 */
const ENTITLEMENT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "CANCELLATION",
  "CANCEL",
  "UNCANCELLATION",
  "EXPIRATION",
  "BILLING_ISSUE",
  "SUBSCRIPTION_PAUSED",
  "SUBSCRIPTION_PAUSE_SCHEDULED",
  "SUBSCRIPTION_UNPAUSED",
  "SUBSCRIPTION_EXTENDED",
  "RENEWAL_EXTENDED",
  "REFUND",
  "REFUND_REVERSED",
  "TRANSFER",
  "SUBSCRIBER_ALIAS",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "INVOICE_ISSUANCE",
])

export type RcSubscriptionInfo = {
  expires_date: string | null
  grace_period_expires_date: string | null
  is_sandbox: boolean
  original_purchase_date: string | null
  period_type: string | null
  purchase_date: string | null
  refunded_at: string | null
  store: string
  store_transaction_id: string | number | null
}

export type RcEntitlementInfo = {
  expires_date: string | null
  grace_period_expires_date: string | null
  product_identifier: string
  purchase_date: string | null
}

export type RcSubscriber = {
  entitlements: Record<string, RcEntitlementInfo>
  management_url: string | null
  original_app_user_id: string
  subscriptions: Record<string, RcSubscriptionInfo>
}

/** Statuses already used by the web billing path (src/app/api/webhooks/stripe). */
export type StoreSubscriptionStatus = "active" | "trialing" | "canceled"

export type StoreEntitlement = {
  isActive: boolean
  status: StoreSubscriptionStatus
  plan: "pro" | "free"
  expiresAt: string | null
  store: string | null
  productId: string | null
  transactionId: string | null
  managementUrl: string | null
}

export function isEntitlementEvent(type: string): boolean {
  return ENTITLEMENT_EVENTS.has(type)
}

/**
 * Verifies the `X-RevenueCat-Webhook-Signature` header.
 *
 * Format is `t=<unix_timestamp>,v1=<hmac_sha256_hex>` where the HMAC is computed
 * over "<timestamp>.<raw body>". The body must be the exact bytes received --
 * re-serializing parsed JSON breaks verification.
 */
export function verifyRevenueCatSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300
): boolean {
  if (!header) return false

  const parts = new Map<string, string>()
  for (const segment of header.split(",")) {
    const idx = segment.indexOf("=")
    if (idx === -1) continue
    parts.set(segment.slice(0, idx).trim(), segment.slice(idx + 1).trim())
  }

  const timestamp = parts.get("t")
  const signature = parts.get("v1")
  if (!timestamp || !signature) return false

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")

  const expectedBuf = Buffer.from(expected, "utf8")
  const signatureBuf = Buffer.from(signature, "utf8")
  if (
    expectedBuf.length !== signatureBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, signatureBuf)
  ) {
    return false
  }

  const signedAt = Number(timestamp)
  if (!Number.isFinite(signedAt)) return false

  return Math.abs(Date.now() / 1000 - signedAt) <= toleranceSeconds
}

/** Reads the latest customer state from RevenueCat. */
export async function fetchSubscriber(
  appUserId: string
): Promise<RcSubscriber | null> {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY
  if (!apiKey) throw new Error("REVENUECAT_SECRET_API_KEY is not configured")

  const response = await fetch(
    `${RC_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    }
  )

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`RevenueCat subscriber lookup failed (${response.status})`)
  }

  const payload = (await response.json()) as { subscriber: RcSubscriber }
  return payload.subscriber
}

/**
 * Reduces the customer payload to the plan/status pair the rest of the app gates on.
 *
 * Access is retained while the entitlement is unexpired, still within a billing
 * grace period (Google and Apple both require honouring grace), or a lifetime
 * entitlement (null expiry, e.g. a promotional grant).
 */
export function deriveEntitlement(
  subscriber: RcSubscriber,
  entitlementId: string = RC_PRO_ENTITLEMENT
): StoreEntitlement {
  const entitlement = subscriber.entitlements?.[entitlementId]
  const now = Date.now()

  const expiresAt = entitlement?.expires_date ?? null
  const graceExpiresAt = entitlement?.grace_period_expires_date ?? null

  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : NaN
  const graceExpiresAtMs = graceExpiresAt ? new Date(graceExpiresAt).getTime() : NaN

  const isLive = expiresAt === null || expiresAtMs > now
  const inGrace = graceExpiresAt !== null && graceExpiresAtMs > now
  const isActive = Boolean(entitlement) && (isLive || inGrace)

  const subscription = entitlement
    ? subscriber.subscriptions?.[entitlement.product_identifier]
    : undefined

  const isTrialPeriod =
    subscription?.period_type === "trial" ||
    subscription?.period_type === "introductory"

  return {
    isActive,
    status: isActive ? (isTrialPeriod ? "trialing" : "active") : "canceled",
    plan: isActive ? "pro" : "free",
    expiresAt,
    store: subscription?.store ?? null,
    productId: entitlement?.product_identifier ?? null,
    transactionId:
      subscription?.store_transaction_id === null ||
      subscription?.store_transaction_id === undefined
        ? null
        : String(subscription.store_transaction_id),
    managementUrl: subscriber.management_url ?? null,
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The mobile SDK is configured with `Purchases.logIn(supabaseUserId)`, so the
 * RevenueCat app user id is the Supabase auth user id. Validate it rather than
 * trusting the webhook payload.
 */
function resolveUserId(appUserId: string): string | null {
  return UUID_RE.test(appUserId) ? appUserId.toLowerCase() : null
}

/**
 * Re-reads the customer from RevenueCat and mirrors the result into the
 * `subscriptions` row that every feature gate already reads.
 *
 * A live Stripe subscription is never downgraded: someone who paid on the web
 * keeps Pro even if their store purchase later lapses.
 */
export async function syncSubscriberToSubscription(
  supabase: SupabaseClient,
  appUserId: string
): Promise<{ outcome: string; status?: string; plan?: string }> {
  const userId = resolveUserId(appUserId)
  if (!userId) return { outcome: "ignored_invalid_app_user_id" }

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership?.org_id) return { outcome: "skipped_no_org" }

  const subscriber = await fetchSubscriber(appUserId)
  const derived = subscriber
    ? deriveEntitlement(subscriber)
    : {
        isActive: false,
        status: "canceled" as const,
        plan: "free" as const,
        expiresAt: null,
        store: null,
        productId: null,
        transactionId: null,
        managementUrl: null,
      }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, plan, status, stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle()

  const hasLiveStripeSubscription =
    existing?.plan === "pro" &&
    (existing.status === "active" || existing.status === "trialing") &&
    !!existing.stripe_subscription_id

  // Record where to manage the subscription, but never revoke a web subscriber.
  if (hasLiveStripeSubscription && !derived.isActive) {
    if (existing?.id) {
      await supabase
        .from("subscriptions")
        .update({
          revenuecat_app_user_id: appUserId,
          management_url: derived.managementUrl,
        })
        .eq("id", existing.id)
    }
    return { outcome: "preserved_stripe_subscription" }
  }

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      org_id: membership.org_id,
      status: derived.status,
      plan: derived.plan,
      current_period_end: derived.expiresAt,
      entitlement_expires_at: derived.expiresAt,
      billing_provider: derived.isActive ? "store" : null,
      revenuecat_app_user_id: appUserId,
      store: derived.store,
      store_product_id: derived.productId,
      store_transaction_id: derived.transactionId,
      management_url: derived.managementUrl,
    },
    { onConflict: "user_id" }
  )

  if (error) throw new Error(`Failed to sync subscription: ${error.message}`)

  return { outcome: "synced", status: derived.status, plan: derived.plan }
}