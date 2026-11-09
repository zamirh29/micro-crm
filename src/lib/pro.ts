import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * A subscription grants Pro while it is active or trialing and on the Pro plan.
 * Store (RevenueCat) purchases are mirrored into the same subscriptions table.
 */
export async function isProUser(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status, plan")
    .eq("user_id", userId)
    .maybeSingle()

  if (!data) return false
  if (data.status !== "active" && data.status !== "trialing") return false
  return (data.plan ?? "free") === "pro"
}
