"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"

export async function createCheckoutSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .single()

  if (!profile) throw new Error("Profile not found")

  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle()

  let customerId = profile.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      metadata: { user_id: user.id },
    })
    customerId = customer.id

    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id)
  }

  const hasPastSubscription = !!existingSub?.stripe_subscription_id

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price: process.env.STRIPE_PRO_PRICE_ID!,
        quantity: 1,
      },
    ],
    subscription_data: hasPastSubscription
      ? undefined
      : { trial_period_days: 30 },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
    metadata: { user_id: user.id },
  })

  if (!session.url) throw new Error("Failed to create checkout session")

  return { url: session.url }
}

export async function createPortalSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  if (!profile?.stripe_customer_id) throw new Error("No subscription found")

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  })

  if (!session.url) throw new Error("Failed to create portal session")

  return { url: session.url }
}
