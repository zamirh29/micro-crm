import { headers } from "next/headers"
import { after, NextResponse } from "next/server"

import {
  isEntitlementEvent,
  syncSubscriberToSubscription,
  verifyRevenueCatSignature,
} from "@/lib/revenuecat"
import { createAdminClient } from "@/lib/supabase/admin"

type RevenueCatWebhookPayload = {
  api_version?: string
  event: {
    id: string
    type: string
    app_user_id?: string
    original_app_user_id?: string
    environment?: string
  }
}

export async function POST(request: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET
  if (!secret) {
    // Fail closed: never accept an unauthenticated entitlement change.
    return NextResponse.json(
      { error: "REVENUECAT_WEBHOOK_SECRET is not configured" },
      { status: 503 }
    )
  }

  // The signature covers the exact bytes sent, so read the body once as text and
  // never re-serialize parsed JSON.
  const rawBody = await request.text()
  const signature = (await headers()).get("x-revenuecat-webhook-signature")

  if (!verifyRevenueCatSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  let payload: RevenueCatWebhookPayload
  try {
    payload = JSON.parse(rawBody) as RevenueCatWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const event = payload?.event
  if (!event?.id || !event.type) {
    return NextResponse.json({ error: "Malformed event" }, { status: 400 })
  }

  const appUserId = event.original_app_user_id ?? event.app_user_id ?? null

  if (!isEntitlementEvent(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type })
  }

  const supabase = createAdminClient()

  // RevenueCat retries failed deliveries up to 5 times, so claim the event id
  // first. A duplicate insert returns no rows and skips processing entirely.
  const { data: claimed, error: claimError } = await supabase
    .from("revenuecat_webhook_events")
    .upsert(
      {
        id: event.id,
        type: event.type,
        app_user_id: appUserId,
        environment: event.environment ?? null,
      },
      { onConflict: "id", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle()

  if (claimError) {
    console.error("RevenueCat webhook claim failed:", claimError.message)
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 })
  }

  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  if (!appUserId) {
    await supabase
      .from("revenuecat_webhook_events")
      .update({ processed_at: new Date().toISOString(), outcome: "no_app_user_id" })
      .eq("id", event.id)
    return NextResponse.json({ received: true, skipped: "no_app_user_id" })
  }

  // Acknowledge immediately and sync after the response, so a slow RevenueCat
  // API call cannot cause a timeout and a retry storm.
  after(async () => {
    try {
      const result = await syncSubscriberToSubscription(supabase, appUserId)
      await supabase
        .from("revenuecat_webhook_events")
        .update({
          processed_at: new Date().toISOString(),
          outcome: JSON.stringify(result),
        })
        .eq("id", event.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`RevenueCat sync failed for event ${event.id}:`, message)
      await supabase
        .from("revenuecat_webhook_events")
        .update({ outcome: `error: ${message}` })
        .eq("id", event.id)
      throw err
    }
  })

  return NextResponse.json({ received: true })
}