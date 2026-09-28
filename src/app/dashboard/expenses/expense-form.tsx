"use client"

import { useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { createExpense } from "./actions"

export default function ExpenseForm({ categories }: { categories: readonly string[] }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = e.currentTarget
    const formData = new FormData(form)

    try {
      await createExpense(formData)
      form.reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-6"
    >
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Add an expense</h2>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label
            htmlFor="incurred_on"
            className="block text-sm font-medium text-foreground"
          >
            Date
          </label>
          <input
            id="incurred_on"
            name="incurred_on"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label
            htmlFor="category"
            className="block text-sm font-medium text-foreground"
          >
            Category <span className="text-destructive">*</span>
          </label>
          <input
            id="category"
            name="category"
            type="text"
            required
            list="expense-categories"
            placeholder="Pick a category or type your own"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <datalist id="expense-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>

        <div>
          <label
            htmlFor="amount"
            className="block text-sm font-medium text-foreground"
          >
            Amount (£) <span className="text-destructive">*</span>
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-foreground"
        >
          Description
        </label>
        <input
          id="description"
          name="description"
          type="text"
          maxLength={500}
          placeholder="What was this for?"
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Adding..." : "Add expense"}
        </button>
      </div>
    </form>
  )
}
