import { Receipt } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { formatCurrency } from "@/lib/utils"
import { EXPENSE_CATEGORIES, isMonth, monthRange } from "@/lib/expenses"
import type { Expense } from "@/types/database"
import MonthSelect from "../month-select"
import ExpenseForm from "./expense-form"
import DeleteExpenseButton from "./delete-expense-button"

export const dynamic = "force-dynamic"

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  })
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  })
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: monthParam } = await searchParams
  const month = monthParam && isMonth(monthParam) ? monthParam : currentMonth()
  const { start, end } = monthRange(month)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single()

  if (!membership) return null

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("org_id", membership.org_id)
    .gte("incurred_on", start)
    .lt("incurred_on", end)
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false })

  const rows = (expenses ?? []) as Expense[]
  const total = rows.reduce((sum, row) => sum + row.amount, 0)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Track what your business spends. Your tax report subtracts these
            from your income.
          </p>
        </div>

        <MonthSelect month={month} key={month} />
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Spent in {monthLabel(month)}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950">
            <Receipt className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold">{formatCurrency(total)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? "expense" : "expenses"} recorded
        </p>
      </div>

      <ExpenseForm categories={EXPENSE_CATEGORIES} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No expenses recorded for {monthLabel(month)} yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="w-10 px-2 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((expense) => (
                <tr key={expense.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                    {formatDate(expense.incurred_on)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {expense.category}
                    </span>
                  </td>
                  <td className="max-w-56 truncate px-4 py-2.5">
                    {expense.description || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium">
                    {formatCurrency(expense.amount)}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <DeleteExpenseButton id={expense.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
