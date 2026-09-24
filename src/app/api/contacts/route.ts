import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
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
    return NextResponse.json({ error: "No organization found" }, { status: 400 })
  }

  let body: {
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    company?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const first_name = (body.first_name ?? "").trim()
  const last_name = (body.last_name ?? "").trim()

  if (!first_name || !last_name) {
    return NextResponse.json(
      { error: "First and last name are required" },
      { status: 400 }
    )
  }

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      org_id: membership.org_id,
      first_name,
      last_name,
      email: (body.email ?? "").trim() || null,
      phone: (body.phone ?? "").trim() || null,
      company: (body.company ?? "").trim() || null,
    })
    .select("id, first_name, last_name, company")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ contact })
}

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
