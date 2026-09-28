import { NextResponse } from "next/server"
import { z } from "zod"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError, readJson, errorFromThrown } from "@/lib/api-utils"
import { createExpenseRecord, isMonth, monthRange } from "@/lib/expenses"

const createSchema = z.object({
  incurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullish(),
  category: z.string().trim().min(1, "Category is required").max(50),
  description: z.string().trim().max(500).nullish(),
  amount: z
    .number()
    .int("Amount must be in pence")
    .min(1, "Amount is required")
    .max(100_000_000, "Amount is too large"),
})

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const month = url.searchParams.get("month")

  if (month && !isMonth(month)) {
    return jsonError("month must be YYYY-MM", 400)
  }

  let query = auth.supabase
    .from("expenses")
    .select("*")
    .eq("org_id", auth.orgId)

  if (month) {
    const { start, end } = monthRange(month)
    query = query.gte("incurred_on", start).lt("incurred_on", end)
  }

  const { data: expenses, error } = await query
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) return jsonError(error.message, 400)

  const rows = expenses ?? []
  const total = rows.reduce((sum, row) => sum + (row.amount as number), 0)

  return NextResponse.json({ expenses: rows, total })
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  const parsed = await readJson(request, createSchema)
  if (!parsed.ok) return parsed.response

  try {
    const expense = await createExpenseRecord(auth.supabase, {
      orgId: auth.orgId,
      userId: auth.user.id,
      input: {
        ...parsed.data,
        description: parsed.data.description ?? null,
      },
    })
    return NextResponse.json({ expense }, { status: 201 })
  } catch (err) {
    return errorFromThrown(err)
  }
}
