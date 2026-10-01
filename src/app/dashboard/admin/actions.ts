"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient as createJsClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperAdmin } from "@/lib/admin"
import {
  ADMIN_SESSION_COOKIE,
  IMPERSONATION_COOKIE,
  buildImpersonationValue,
  clearImpersonationCookies,
  impersonationCookieOptions,
} from "@/lib/impersonation"

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

export async function openAccount(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")
  if (!isSuperAdmin(user.email)) throw new Error("Forbidden")

  const targetUserId = formData.get("userId")
  if (typeof targetUserId !== "string" || !targetUserId) {
    throw new Error("Invalid arguments")
  }

  const fail: (message: string) => never = (message) =>
    redirect(`/dashboard/admin?error=${encodeURIComponent(message)}`)

  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession()
  if (!currentSession) throw new Error("Unauthorized")

  const admin = createAdminClient()

  const { data: targetData, error: targetError } =
    await admin.auth.admin.getUserById(targetUserId)
  if (targetError || !targetData?.user?.email) {
    fail("That account could not be found.")
  }
  const targetUser = targetData.user
  const targetEmail = targetData.user.email!

  if (targetEmail.toLowerCase() === (user.email ?? "").toLowerCase()) {
    redirect("/dashboard/admin")
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
  })
  if (linkError || !link?.properties?.hashed_token) {
    fail(linkError?.message ?? "Could not prepare the account switch.")
  }

  const anon = createJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  })
  if (verifyError || !verified?.session) {
    fail(verifyError?.message ?? "The account switch could not be completed.")
  }

  const cookieStore = await cookies()
  cookieStore.set(
    ADMIN_SESSION_COOKIE,
    JSON.stringify({
      access_token: currentSession.access_token,
      refresh_token: currentSession.refresh_token,
    }),
    impersonationCookieOptions()
  )
  cookieStore.set(
    IMPERSONATION_COOKIE,
    buildImpersonationValue(targetUser.id, targetEmail),
    impersonationCookieOptions()
  )

  const ssr = await createClient()
  const { error: swapError } = await ssr.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  })
  if (swapError) {
    await clearImpersonationCookies()
    fail(swapError.message)
  }

  revalidatePath("/", "layout")
  redirect("/dashboard")
}

export async function exitImpersonation() {
  const cookieStore = await cookies()
  if (!cookieStore.get(IMPERSONATION_COOKIE)?.value) {
    redirect("/dashboard")
  }

  const backup = cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  await clearImpersonationCookies()

  let restored = false
  if (backup) {
    try {
      const parsed = JSON.parse(backup)
      if (
        typeof parsed?.access_token === "string" &&
        typeof parsed?.refresh_token === "string"
      ) {
        const supabase = await createClient()
        const { error } = await supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        })
        if (error) {
          console.error("exitImpersonation: setSession failed:", error.message)
        } else {
          restored = true
        }
      } else {
        console.error("exitImpersonation: backup session malformed")
      }
    } catch (e) {
      console.error("exitImpersonation: backup restore threw:", (e as Error)?.message)
    }
  } else {
    console.error("exitImpersonation: no backup cookie present")
  }

  if (restored) {
    revalidatePath("/", "layout")
    redirect("/dashboard")
  }

  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
