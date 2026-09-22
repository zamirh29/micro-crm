import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      await ensureUserSetup(data.user.id, data.user.email ?? "")
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}

async function ensureUserSetup(userId: string, email: string) {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle()

  if (profile) return

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: email.split("@")[0] })
    .select("id")
    .single()

  if (!org || orgError) return

  await admin.from("profiles").insert({
    id: userId,
    email,
  })

  await admin.from("memberships").insert({
    user_id: userId,
    org_id: org.id,
    role: "owner",
  })

  await admin.from("subscriptions").insert({
    user_id: userId,
    org_id: org.id,
    status: "active",
    plan: "free",
  })
}
