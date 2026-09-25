import type { SupabaseClient } from "@supabase/supabase-js"

export const FREE_TRIAL_DAYS = 90
export const FREE_QUOTES_PER_MONTH = 20
export const FREE_INVOICES_PER_MONTH = 20

export type DocType = "quote" | "invoice"

export class PlanLimitError extends Error {}

export async function assertDocumentCreationAllowed(opts: {
  supabase: SupabaseClient
  userId: string
  orgId: string
  type: DocType
}) {
  const { supabase, userId, orgId, type } = opts

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if ((subscription?.plan ?? "free") === "pro") return

  let trialStart: Date
  if (subscription?.created_at) {
    trialStart = new Date(subscription.created_at)
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("created_at")
      .eq("id", userId)
      .maybeSingle()
    trialStart = profile?.created_at ? new Date(profile.created_at) : new Date()
  }

  const trialEnd = new Date(
    trialStart.getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000
  )
  if (Date.now() > trialEnd.getTime()) {
    throw new PlanLimitError(
      "Your 90-day free trial has ended. Upgrade to Pro to continue creating quotes and invoices."
    )
  }

  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  )
  const table = type === "quote" ? "quotes" : "invoices"
  const limit =
    type === "quote" ? FREE_QUOTES_PER_MONTH : FREE_INVOICES_PER_MONTH

  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", startOfMonth.toISOString())

  if ((count ?? 0) >= limit) {
    const label = type === "quote" ? "quotes" : "invoices"
    throw new PlanLimitError(
      `You've reached the free limit of ${limit} ${label} per month. Upgrade to Pro for unlimited ${label}.`
    )
  }
}