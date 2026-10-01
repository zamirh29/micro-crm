import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { hasSuperAdminPrivilege } from "@/lib/impersonation"
import { jsonError, readJson, errorFromThrown } from "@/lib/api-utils"
import {
  updateQuoteRecord,
  deleteQuoteRecord,
} from "@/lib/documents"
import { checkEditGate } from "@/lib/subscription"

const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Line item description is required"),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unit_price: z.number().nonnegative("Unit price cannot be negative"),
})

const patchSchema = z.object({
  contact_id: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Title is required").optional(),
  description: z.string().nullish(),
  tax_rate: z.number().min(0).max(100).optional(),
  notes: z.string().nullish(),
  valid_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "valid_until must be YYYY-MM-DD")
    .nullish(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).optional(),
  currency: z.string().min(1).optional(),
  items: z.array(lineItemSchema).min(1, "At least one line item is required").optional(),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  const { data: quote, error } = await auth.supabase
    .from("quotes")
    .select("*, contacts(*), quote_items(*)")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (error) return jsonError(error.message, 400)
  if (!quote) return jsonError("Quote not found", 404)

  const gate = await checkEditGate(auth.supabase, auth.user, {
    status: quote.status as string | null,
  })

  return NextResponse.json({
    quote,
    can_edit: gate.ok,
    can_edit_date: await hasSuperAdminPrivilege(auth.user),
    edit_block: gate.ok ? null : gate.status === 403 ? "plan" : "paid",
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  const { data: existing, error: lookupError } = await auth.supabase
    .from("quotes")
    .select("status")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (lookupError) return jsonError(lookupError.message, 400)
  if (!existing) return jsonError("Quote not found", 404)

  const gate = await checkEditGate(auth.supabase, auth.user, existing)
  if (!gate.ok) return jsonError(gate.message, gate.status)

  const parsed = await readJson(request, patchSchema)
  if (!parsed.ok) return parsed.response

  try {
    const quote = await updateQuoteRecord(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      id,
      input: parsed.data,
    })
    if (!quote) return jsonError("Quote not found", 404)
    return NextResponse.json({ quote })
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
    await deleteQuoteRecord(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      id,
    })
    return NextResponse.json({ deleted: true, id })
  } catch (err) {
    return errorFromThrown(err)
  }
}
