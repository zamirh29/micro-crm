import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.json({ contacts: [] })
  }

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, company")
    .eq("org_id", membership.org_id)
    .order("first_name")

  return NextResponse.json({ contacts: contacts ?? [] })
}
