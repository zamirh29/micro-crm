"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createReminder } from "../actions"
import type { Contact, Quote, Invoice } from "@/types/database"
import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export default function NewReminderPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Pick<Contact, "id" | "first_name" | "last_name">[]>([])
  const [quotes, setQuotes] = useState<Pick<Quote, "id" | "number" | "title">[]>([])
  const [invoices, setInvoices] = useState<Pick<Invoice, "id" | "number" | "title">[]>([])

  const [form, setForm] = useState({
    title: "",
    description: "",
    contact_id: "",
    quote_id: "",
    invoice_id: "",
    scheduled_at: "",
  })

  useEffect(() => {
    const supabase = createClient()
    async function fetchData() {
      const { data: contactsData } = await supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .order("first_name")
      if (contactsData) setContacts(contactsData)

      const { data: quotesData } = await supabase
        .from("quotes")
        .select("id, number, title")
        .order("created_at", { ascending: false })
      if (quotesData) setQuotes(quotesData)

      const { data: invoicesData } = await supabase
        .from("invoices")
        .select("id, number, title")
        .order("created_at", { ascending: false })
      if (invoicesData) setInvoices(invoicesData)
    }
    fetchData()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await createReminder({
        title: form.title,
        description: form.description || null,
        contact_id: form.contact_id || null,
        quote_id: form.quote_id || null,
        invoice_id: form.invoice_id || null,
        scheduled_at: form.scheduled_at,
      })
      router.push("/dashboard/reminders")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Reminder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Schedule a reminder for follow-up.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-background p-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            Title
          </label>
          <input
            id="title"
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Follow up with client"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            id="description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Optional details..."
          />
        </div>

        <div>
          <label htmlFor="contact_id" className="block text-sm font-medium text-gray-700">
            Customer
          </label>
          <select
            id="contact_id"
            value={form.contact_id}
            onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">No customer</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.first_name} {contact.last_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="quote_id" className="block text-sm font-medium text-gray-700">
            Quote
          </label>
          <select
            id="quote_id"
            value={form.quote_id}
            onChange={(e) => setForm({ ...form, quote_id: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">No quote</option>
            {quotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.number} - {quote.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="invoice_id" className="block text-sm font-medium text-gray-700">
            Invoice
          </label>
          <select
            id="invoice_id"
            value={form.invoice_id}
            onChange={(e) => setForm({ ...form, invoice_id: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">No invoice</option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.number} - {invoice.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="scheduled_at" className="block text-sm font-medium text-gray-700">
            Scheduled At
          </label>
          <input
            id="scheduled_at"
            type="datetime-local"
            required
            value={form.scheduled_at}
            onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Reminder"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
