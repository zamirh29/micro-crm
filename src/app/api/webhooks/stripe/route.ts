import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import type Stripe from "stripe"

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()
  const sig = headersList.get("stripe-signature")

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.user_id
      const priceId = session.line_items?.data?.[0]?.price?.id
      const plan = priceId === process.env.STRIPE_PRO_PRICE_ID ? "pro" : "free"

      if (userId) {
        const { data: memberships } = await supabase
          .from("memberships")
          .select("org_id")
          .eq("user_id", userId)
          .limit(1)
          .single()

        if (memberships) {
          await supabase.from("subscriptions").upsert(
            {
              user_id: userId,
              org_id: memberships.org_id,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              status: "active",
              plan: plan as "free" | "pro",
            },
            { onConflict: "user_id" }
          )
        }
      }
      break
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as unknown as {
        id: string
        status: string
        current_period_end: number
        items: { data: Array<{ price: { id: string } }> }
      }
      const status =
        sub.status === "active"
          ? "active"
          : sub.status === "past_due"
            ? "past_due"
            : sub.status === "trialing"
              ? "trialing"
              : "canceled"

      const priceId = sub.items.data[0]?.price.id
      const plan = priceId === process.env.STRIPE_PRO_PRICE_ID ? "pro" : "free"

      const periodEnd = new Date(sub.current_period_end * 1000).toISOString()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = {
        status,
        plan,
        current_period_end: periodEnd,
      }

      await supabase
        .from("subscriptions")
        .update(updateData)
        .eq("stripe_subscription_id", sub.id)
      break
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription

      await supabase
        .from("subscriptions")
        .update({
          status: "canceled",
          plan: "free",
          stripe_subscription_id: null,
        })
        .eq("stripe_subscription_id", subscription.id)
      break
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice
      const invoiceData = invoice as unknown as { subscription?: string }

      if (invoiceData.subscription) {
        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", invoiceData.subscription)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
