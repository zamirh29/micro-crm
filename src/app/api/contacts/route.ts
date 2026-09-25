import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson, errorFromThrown } from "@/lib/api-utils"
import { createContactRecord } from "@/lib/documents"

const createSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  company: z.string().nullish(),
  status: z.enum(["lead", "prospect", "client", "inactive"]).nullish(),
  notes: z.string().nullish(),
})

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { data: contacts, error } = await auth.supabase
    .from("contacts")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("first_name")
    .limit(500)

  if (error) return jsonError(error.message, 400)

  return NextResponse.json({ contacts: contacts ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const parsed = await readJson(request, createSchema)
  if (!parsed.ok) return parsed.response

  try {
    const contact = await createContactRecord(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      input: { ...parsed.data, status: parsed.data.status ?? undefined },
    })
    return NextResponse.json({ contact }, { status: 201 })
  } catch (err) {
    return errorFromThrown(err)
  }
}
