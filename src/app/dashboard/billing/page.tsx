"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { createCheckoutSession, createPortalSession } from "./actions"
import { Check, Loader2 } from "lucide-react"
import { PLANS } from "@/lib/stripe"
import { formatCurrency } from "@/lib/utils"

type PlanKey = "free" | "pro"

export default function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState<PlanKey | null>(null)
  const [loading, setLoading] = useState(false)

  useState(() => {
    const query = new URLSearchParams(window.location.search)
    if (query.get("success") === "true") {
      setCurrentPlan("pro")
    } else {
      const supabase = createClient()
      supabase
        .from("subscriptions")
        .select("status, plan")
        .maybeSingle()
        .then(({ data }) => {
          if (data?.status === "active" || data?.status === "trialing") {
            setCurrentPlan((data.plan as PlanKey) || "free")
          } else {
            setCurrentPlan("free")
          }
        })
    }
  })

  if (currentPlan === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isSubscribed = currentPlan === "pro"

  const handleCheckout = async () => {
    setLoading(true)
    try {
      const { url } = await createCheckoutSession()
      window.location.href = url
    } catch {
      setLoading(false)
    }
  }

  const handlePortal = async () => {
    setLoading(true)
    try {
      const { url } = await createPortalSession()
      window.location.href = url
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and billing. First 3 months free on Pro.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-6">
          <h2 className="text-lg font-semibold">Current Plan</h2>
          <div className="mt-4">
            <span className="text-3xl font-bold">
              {isSubscribed ? PLANS.pro.name : PLANS.free.name}
            </span>
            <span className="ml-2 text-sm text-muted-foreground">
              {isSubscribed
                ? `${formatCurrency(PLANS.pro.price)}/month`
                : "Free"}
            </span>
          </div>
          <div className="mt-6">
            {isSubscribed ? (
              <button
                onClick={handlePortal}
                disabled={loading}
                className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Manage Subscription"
                )}
              </button>
            ) : (
              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Upgrade to Pro"
                )}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {Object.entries(PLANS).map(([key, plan]) => {
            const planKey = key as PlanKey
            const isCurrent = currentPlan === planKey
            return (
              <div
                key={key}
                className={`rounded-lg border bg-background p-6 ${
                  isCurrent
                    ? "border-indigo-500 ring-1 ring-indigo-500"
                    : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  {isCurrent && (
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {plan.price > 0 ? formatCurrency(plan.price) : "Free"}
                  {plan.price > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /month
                    </span>
                  )}
                </p>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Check className="h-4 w-4 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <button
                    onClick={handleCheckout}
                    disabled={loading}
                    className={`mt-6 w-full rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                      planKey === "pro"
                        ? "bg-indigo-600 text-white hover:bg-indigo-500"
                        : "border border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {loading ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : planKey === "pro" ? (
                      `Upgrade to ${plan.name}`
                    ) : (
                      "Downgrade"
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
