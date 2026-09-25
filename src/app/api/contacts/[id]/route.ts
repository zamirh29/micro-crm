import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson, errorFromThrown } from "@/lib/api-utils"
import { updateContactRecord, deleteContactRecord } from "@/lib/documents"

const patchSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").optional(),
  last_name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  company: z.string().nullish(),
  status: z.enum(["lead", "prospect", "client", "inactive"]).optional(),
  notes: z.string().nullish(),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  const { data: contact, error } = await auth.supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (error) return jsonError(error.message, 400)
  if (!contact) return jsonError("Customer not found", 404)

  const [{ data: quotes }, { data: invoices }] = await Promise.all([
    auth.supabase
      .from("quotes")
      .select("id, number, title, status, total, currency, created_at")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    auth.supabase
      .from("invoices")
      .select("id, number, title, status, total, currency, due_date, created_at")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
  ])

  return NextResponse.json({
    contact: { ...contact, quotes: quotes ?? [], invoices: invoices ?? [] },
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  const parsed = await readJson(request, patchSchema)
  if (!parsed.ok) return parsed.response

  try {
    const contact = await updateContactRecord(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      id,
      input: parsed.data,
    })
    if (!contact) return jsonError("Customer not found", 404)
    return NextResponse.json({ contact })
  } catch (err) {
    return errorFromThrown(err)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const result = await deleteContactRecord(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      id,
    })
    return NextResponse.json({
      deleted: true,
      id: result.contact.id,
      quoteCount: result.quoteCount,
      invoiceCount: result.invoiceCount,
    })
  } catch (err) {
    return errorFromThrown(err)
  }
}
