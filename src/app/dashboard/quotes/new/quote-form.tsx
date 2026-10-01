"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { createQuote, updateQuote } from "../actions"
import CustomerSelect from "@/components/customer-select"
import {
  CURRENCIES,
  currencySymbol,
  DEFAULT_COMPANY,
} from "@/lib/company"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
}

interface QuoteFormProps {
  defaultCurrency?: string
  quote?: {
    id: string
    contact_id: string
    title: string
    description: string | null
    tax_rate: number
    notes: string | null
    valid_until: string | null
    currency: string
  }
  quoteItems?: { description: string; quantity: number; unit_price: number }[]
  error?: string | null
  quote_date?: string
  sent_date?: string
  accepted_date?: string
  canEditDate?: boolean
}

export default function QuoteForm({
  defaultCurrency,
  quote,
  quoteItems,
  error: initialError,
  quote_date,
  sent_date,
  accepted_date,
  canEditDate,
}: QuoteFormProps) {
  const showDates = Boolean(quote) && Boolean(canEditDate)
  const [contactId, setContactId] = useState(quote?.contact_id ?? "")
  const [currency, setCurrency] = useState(
    quote?.currency || defaultCurrency || DEFAULT_COMPANY.currency
  )
  const [items, setItems] = useState<LineItem[]>(
    quoteItems && quoteItems.length > 0
      ? quoteItems
      : [{ description: "", quantity: 1, unit_price: 0 }]
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (quote) return
    const defaultDate = new Date()
    defaultDate.setDate(defaultDate.getDate() + 30)
    const dateInput = document.getElementById("valid_until") as HTMLInputElement
    if (dateInput) {
      dateInput.value = defaultDate.toISOString().split("T")[0]
    }
  }, [quote])

  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  )
  const taxRate = quote?.tax_rate ?? 20
  const taxAmount = Math.round(subtotal * (taxRate / 100))
  const total = subtotal + taxAmount
  const symbol = currencySymbol(currency)

  function addItem() {
    setItems([...items, { description: "", quantity: 1, unit_price: 0 }])
  }

  function removeItem(index: number) {
    if (items.length === 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(
    index: number,
    field: keyof LineItem,
    value: string | number
  ) {
    const updated = [...items]
    if (field === "description") {
      updated[index].description = value as string
    } else if (field === "unit_price") {
      updated[index].unit_price = Math.round(
        (parseFloat(value as string) || 0) * 100
      )
    } else {
      updated[index][field] = Number(value) || 0
    }
    setItems(updated)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set("items", JSON.stringify(items))
    formData.set("tax_rate", String(taxRate))
    formData.set("currency", currency)

    try {
      if (quote) {
        await updateQuote(quote.id, formData)
      } else {
        await createQuote(formData)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setLoading(false)
    }
  }

  function formatAmount(amount: number): string {
    return `${symbol}${(amount / 100).toFixed(2)}`
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={quote ? `/dashboard/quotes/${quote.id}` : "/dashboard/quotes"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {quote ? "Edit Quote" : "New Quote"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {quote
              ? "Update the details for this quote"
              : "Create a new quote for your client"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {initialError && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-md px-4 py-3 text-sm">
            {initialError}
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-border bg-card shadow-sm p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <CustomerSelect
                name="contact_id"
                value={contactId}
                onChange={setContactId}
                required
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="valid_until"
                className="text-sm font-medium leading-none"
              >
                Valid Until
              </label>
              <input
                id="valid_until"
                name="valid_until"
                type="date"
                defaultValue={quote?.valid_until ?? undefined}
                required={!quote}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {showDates && (
              <div className="space-y-2">
                <label
                  htmlFor="quote_date"
                  className="text-sm font-medium leading-none"
                >
                  Quote date
                </label>
                <input
                  id="quote_date"
                  name="quote_date"
                  type="date"
                  defaultValue={quote_date ?? undefined}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            {showDates && (
              <div className="space-y-2">
                <label
                  htmlFor="sent_date"
                  className="text-sm font-medium leading-none"
                >
                  Sent date
                </label>
                <input
                  id="sent_date"
                  name="sent_date"
                  type="date"
                  defaultValue={sent_date ?? undefined}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            {showDates && (
              <div className="space-y-2">
                <label
                  htmlFor="accepted_date"
                  className="text-sm font-medium leading-none"
                >
                  Accepted date
                </label>
                <input
                  id="accepted_date"
                  name="accepted_date"
                  type="date"
                  defaultValue={accepted_date ?? undefined}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  When the customer accepted this quote. Clear it if the quote is
                  not accepted.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="currency"
                className="text-sm font-medium leading-none"
              >
                Currency
              </label>
              <select
                id="currency"
                name="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium leading-none">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              defaultValue={quote?.title}
              required
              placeholder="e.g. Website Redesign Proposal"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="description"
              className="text-sm font-medium leading-none"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={quote?.description ?? undefined}
              placeholder="Optional description or scope of work"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Line Items</h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]"
              >
                <input
                  type="text"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) =>
                    updateItem(index, "description", e.target.value)
                  }
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  type="number"
                  placeholder="Qty"
                  min="1"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(index, "quantity", e.target.value)
                  }
                  required
                  className="flex h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
<input
                  type="number"
                  placeholder="Unit Price"
                  min="0"
                  step="0.01"
                  value={item.unit_price ? item.unit_price / 100 : ""}
                  onChange={(e) =>
                    updateItem(index, "unit_price", e.target.value)
                  }
                  required
                  className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex h-10 items-center justify-end text-sm font-medium w-28">
                  {formatAmount(item.quantity * item.unit_price)}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatAmount(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax ({taxRate}%)</span>
              <span className="font-medium">{formatAmount(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t border-border pt-2">
              <span>Total</span>
              <span>{formatAmount(total)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm p-6 space-y-2">
          <label htmlFor="notes" className="text-sm font-medium leading-none">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={quote?.notes ?? undefined}
            placeholder="Internal notes (not shown to client)"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/dashboard/quotes"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {loading
              ? quote
                ? "Saving..."
                : "Creating..."
              : quote
                ? "Save changes"
                : "Create Quote"}
          </button>
        </div>
      </form>
    </div>
  )
}