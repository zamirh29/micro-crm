import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export interface ApiContext {
  supabase: SupabaseClient
  user: User
  orgId: string
}

export type ApiAuthResult =
  | ({ ok: true } & ApiContext)
  | { ok: false; response: NextResponse }

export async function requireApiUser(request: Request): Promise<ApiAuthResult> {
  const authHeader = request.headers.get("authorization")
  let supabase: SupabaseClient
  let user: User | null = null

  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim()
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )
    const { data, error } = await supabase.auth.getUser()
    if (!data.user || error) {
      return unauthorized()
    }
    user = data.user
  } else {
    supabase = (await createClient()) as unknown as SupabaseClient
    const { data } = await supabase.auth.getUser()
    if (!data.user) {
      return unauthorized()
    }
    user = data.user
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No organization found" },
        { status: 400 }
      ),
    }
  }

  return { ok: true, supabase, user, orgId: membership.org_id }
}

function unauthorized() {
  return {
    ok: false as const,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  }
}
