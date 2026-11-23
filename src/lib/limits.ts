import type { SupabaseClient } from "@supabase/supabase-js"
import { getImpersonation } from "@/lib/impersonation"

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

  const impersonation = await getImpersonation()
  if (impersonation?.userId === userId) return

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if ((subscription?.plan ?? "free") === "pro") return

  // The Free plan never expires; only the monthly limits below apply.
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