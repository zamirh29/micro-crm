import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson, errorFromThrown } from "@/lib/api-utils"
import { deleteExpenseRecord } from "@/lib/expenses"

const patchSchema = z.object({
  incurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
  category: z.string().trim().min(1, "Category is required").max(50).optional(),
  description: z.string().trim().max(500).nullish(),
  amount: z
    .number()
    .int("Amount must be in pence")
    .min(1, "Amount is required")
    .max(100_000_000, "Amount is too large")
    .optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  const parsed = await readJson(request, patchSchema)
  if (!parsed.ok) return parsed.response

  const patch: Record<string, unknown> = { ...parsed.data }
  if (patch.description === null) patch.description = null

  const { data: expense, error } = await auth.supabase
    .from("expenses")
    .update(patch)
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .select("*")
    .maybeSingle()

  if (error) return jsonError(error.message, 400)
  if (!expense) return jsonError("Expense not found", 404)

  return NextResponse.json({ expense })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const expense = await deleteExpenseRecord(auth.supabase, {
      orgId: auth.orgId,
      id,
    })
    return NextResponse.json({ deleted: true, id: expense.id })
  } catch (err) {
    return errorFromThrown(err)
  }
}
