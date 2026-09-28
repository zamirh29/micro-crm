import type { SupabaseClient } from "@supabase/supabase-js"
import type { Expense } from "@/types/database"

export const EXPENSE_CATEGORIES = [
  "Parts & materials",
  "Travel",
  "Rent & utilities",
  "Phone & internet",
  "Insurance",
  "Tools & equipment",
  "Professional fees",
  "Marketing",
  "Other",
] as const

export interface ExpenseInput {
  incurred_on?: string | null
  category: string
  description?: string | null
  amount: number
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isMonth(value: string): boolean {
  return MONTH_RE.test(value)
}

/** Inclusive `YYYY-MM-DD` bounds for a `YYYY-MM` month. */
export function monthRange(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number)
  const endYear = mon === 12 ? year + 1 : year
  const endMonth = mon === 12 ? 1 : mon + 1
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    start: `${year}-${pad(mon)}-01`,
    end: `${endYear}-${pad(endMonth)}-01`,
  }
}

export async function createExpenseRecord(
  supabase: SupabaseClient,
  params: { orgId: string; userId: string; input: ExpenseInput }
): Promise<Expense> {
  const { orgId, userId, input } = params

  const incurred_on =
    input.incurred_on && DATE_RE.test(input.incurred_on)
      ? input.incurred_on
      : new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      org_id: orgId,
      created_by: userId,
      incurred_on,
      category: input.category,
      description: input.description || null,
      amount: input.amount,
    })
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data as Expense
}

export async function deleteExpenseRecord(
  supabase: SupabaseClient,
  params: { orgId: string; id: string }
): Promise<Expense> {
  const { data, error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", params.id)
    .eq("org_id", params.orgId)
    .select("*")
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("Expense not found")
  return data as Expense
}
