"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { createInvoice } from "../actions"
import CustomerSelect from "@/components/customer-select"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
}

function formatPence(amount: number): string {
  return (amount / 100).toFixed(2)
}

function parsePence(value: string): number {
  return Math.round(parseFloat(value || "0") * 100)
}

export default function NewInvoicePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    contact_id: "",
    title: "",
    description: "",
    tax_rate: "0",
    notes: "",
    due_date: "",
    currency: "GBP",
  })

  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price: 0 },
  ])

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
    } else if (field === "quantity") {
      updated[index].quantity = parseInt(value as string) || 0
    } else {
      updated[index].unit_price = parsePence(value as string)
    }
    setItems(updated)
  }

  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  )
  const taxRate = parseFloat(form.tax_rate) || 0
  const taxAmount = Math.round(subtotal * (taxRate / 100))
  const total = subtotal + taxAmount

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const fd = new FormData()
      fd.set("contact_id", form.contact_id)
      fd.set("title", form.title)
      fd.set("description", form.description)
      fd.set("tax_rate", form.tax_rate)
      fd.set("notes", form.notes)
      fd.set("due_date", form.due_date)
      fd.set("currency", form.currency)
      fd.set("items", JSON.stringify(items))

      await createInvoice(fd)
      router.push("/dashboard/invoices")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Invoice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a new invoice for a contact.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <CustomerSelect
                value={form.contact_id}
                onChange={(contact_id) => setForm({ ...form, contact_id })}
                required
              />
            </div>

            <div>
              <label
                htmlFor="due_date"
                className="block text-sm font-medium text-foreground"
              >
                Due Date
              </label>
              <input
                id="due_date"
                type="date"
                required
                value={form.due_date}
                onChange={(e) =>
                  setForm({ ...form, due_date: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-foreground"
            >
              Title
            </label>
            <input
              id="title"
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Invoice for services"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-foreground"
            >
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Optional description..."
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Line Items</h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-md border border-border p-3"
              >
                <div className="flex-1 space-y-3">
                  <input
                    type="text"
                    required
                    value={item.description}
                    onChange={(e) =>
                      updateItem(index, "description", e.target.value)
                    }
                    placeholder="Item description"
                    className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(index, "quantity", e.target.value)
                        }
                        className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Unit Price
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={formatPence(item.unit_price)}
                        onChange={(e) =>
                          updateItem(index, "unit_price", e.target.value)
                        }
                        className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 pt-1">
                  <span className="text-sm font-medium">
                    {formatPence(item.quantity * item.unit_price)}
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="tax_rate"
                  className="block text-sm font-medium text-foreground"
                >
                  Tax Rate (%)
                </label>
                <input
                  id="tax_rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.tax_rate}
                  onChange={(e) =>
                    setForm({ ...form, tax_rate: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col justify-end">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">{formatPence(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Tax ({taxRate}%)
                    </span>
                    <span className="font-medium">{formatPence(taxAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1 text-base font-semibold">
                    <span>Total</span>
                    <span>{formatPence(total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-foreground"
            >
              Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Payment terms, bank details, etc."
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Invoice"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
