"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus, X } from "lucide-react"

interface Customer {
  id: string
  first_name: string
  last_name: string
  company: string | null
}

interface CustomerSelectProps {
  value: string
  onChange: (value: string) => void
  name?: string
  required?: boolean
  label?: string
}

export default function CustomerSelect({
  value,
  onChange,
  name,
  required,
  label = "Customer",
}: CustomerSelectProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newCustomer, setNewCustomer] = useState({
    first_name: "",
    last_name: "",
    company: "",
    email: "",
    phone: "",
  })

  useEffect(() => {
    fetch("/api/contacts")
      .then((res) => res.json())
      .then((data) => setCustomers(data.contacts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCustomer),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create customer")

      setCustomers((prev) => [...prev, data.contact])
      onChange(data.contact.id)
      setShowNew(false)
      setNewCustomer({
        first_name: "",
        last_name: "",
        company: "",
        email: "",
        phone: "",
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={name}
        className="block text-sm font-medium leading-none"
      >
        {label}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">
          {loading ? "Loading customers..." : "Select a customer"}
        </option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.first_name} {customer.last_name}
            {customer.company ? ` (${customer.company})` : ""}
          </option>
        ))}
      </select>

      {!showNew ? (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          New Customer
        </button>
      ) : (
        <form
          onSubmit={handleCreateCustomer}
          className="space-y-3 rounded-md border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">New Customer</span>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              placeholder="First name"
              value={newCustomer.first_name}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, first_name: e.target.value })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <input
              type="text"
              required
              placeholder="Last name"
              value={newCustomer.last_name}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, last_name: e.target.value })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <input
              type="text"
              placeholder="Company"
              value={newCustomer.company}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, company: e.target.value })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <input
              type="email"
              placeholder="Email"
              value={newCustomer.email}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, email: e.target.value })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newCustomer.phone}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, phone: e.target.value })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-2"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {creating ? "Creating..." : "Create Customer"}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}