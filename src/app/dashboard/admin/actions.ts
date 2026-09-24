"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin } from "@/lib/admin"

export async function setCustomerPlan(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")
  if (!isSuperAdmin(user.email)) throw new Error("Forbidden")

  const targetUserId = formData.get("userId")
  const action = formData.get("action")

  if (typeof targetUserId !== "string" || typeof action !== "string") {
    throw new Error("Invalid arguments")
  }

  if (action !== "activate" && action !== "revert") {
    throw new Error("Invalid action")
  }

  const nextPlan = action === "activate" ? "pro" : "free"

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, user_id, org_id")
    .eq("user_id", targetUserId)
    .maybeSingle()

  if (existing) {
    await admin
      .from("subscriptions")
      .update({
        plan: nextPlan,
        status: "active",
        stripe_subscription_id: null,
        stripe_customer_id: null,
        current_period_end: null,
      })
      .eq("id", existing.id)
  } else {
    const { data: membership } = await admin
      .from("memberships")
      .select("org_id")
      .eq("user_id", targetUserId)
      .single()

    await admin.from("subscriptions").insert({
      user_id: targetUserId,
      org_id: membership?.org_id ?? null,
      plan: nextPlan,
      status: "active",
    })
  }

  revalidatePath("/dashboard/admin")
}