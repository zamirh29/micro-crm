import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { hasSuperAdminPrivilege } from "@/lib/impersonation"
import { jsonError, readJson, errorFromThrown } from "@/lib/api-utils"
import { updateInvoiceRecord, deleteInvoiceRecord } from "@/lib/documents"
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
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "due_date must be YYYY-MM-DD")
    .nullish(),
  status: z.enum(["draft", "sent", "paid", "overdue"]).optional(),
  currency: z.string().min(1).optional(),
  invoice_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "invoice_date must be YYYY-MM-DD")
    .optional(),
  items: z.array(lineItemSchema).min(1, "At least one line item is required").optional(),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  const { data: invoice, error } = await auth.supabase
    .from("invoices")
    .select("*, contacts(*), invoice_items(*)")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (error) return jsonError(error.message, 400)
  if (!invoice) return jsonError("Invoice not found", 404)

  const gate = await checkEditGate(auth.supabase, auth.user, {
    status: invoice.status as string | null,
  })

  return NextResponse.json({
    invoice,
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
    .from("invoices")
    .select("status")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (lookupError) return jsonError(lookupError.message, 400)
  if (!existing) return jsonError("Invoice not found", 404)

  const gate = await checkEditGate(auth.supabase, auth.user, existing)
  if (!gate.ok) return jsonError(gate.message, gate.status)

  const parsed = await readJson(request, patchSchema)
  if (!parsed.ok) return parsed.response

  const { invoice_date: invoiceDate, ...patch } = parsed.data

  if (invoiceDate && !(await hasSuperAdminPrivilege(auth.user))) {
    return jsonError("Only the super admin can change the invoice date", 403)
  }

  try {
    const invoice = await updateInvoiceRecord(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      id,
      input: patch,
    })
    if (!invoice) return jsonError("Invoice not found", 404)

    if (invoiceDate) {
      await auth.supabase
        .from("invoices")
        .update({ created_at: `${invoiceDate}T12:00:00.000Z` })
        .eq("id", id)
        .eq("org_id", auth.orgId)
    }

    return NextResponse.json({ invoice })
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
    await deleteInvoiceRecord(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      id,
    })
    return NextResponse.json({ deleted: true, id })
  } catch (err) {
    return errorFromThrown(err)
  }
}
