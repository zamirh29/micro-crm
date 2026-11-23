"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { unstable_rethrow } from "next/navigation"
import { updateContact } from "../../actions"
import { isCompanyContact } from "@/lib/utils"

interface ContactEditFormProps {
  contact: {
    id: string
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    company: string | null
    address: string | null
    status: string
    notes: string | null
    tax_rate: number | null
    vat_registered: boolean
  }
}

export default function ContactEditForm({
  contact,
}: ContactEditFormProps) {
  const companyCustomer = isCompanyContact(contact)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customerType, setCustomerType] = useState<"person" | "company">(
    companyCustomer ? "company" : "person"
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = e.currentTarget
    const formData = new FormData(form)

    try {
      await updateContact(contact.id, formData)
    } catch (err) {
      unstable_rethrow(err)
      setError(err instanceof Error ? err.message : "Something went wrong")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="customer_type"
          className="block text-sm font-medium text-foreground"
        >
          Customer type
        </label>
        <select
          id="customer_type"
          name="customer_type"
          value={customerType}
          onChange={(e) => setCustomerType(e.target.value as "person" | "company")}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="person">Person</option>
          <option value="company">Company</option>
        </select>
      </div>

      {customerType === "company" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="company"
                className="block text-sm font-medium text-foreground"
              >
                Company name <span className="text-destructive">*</span>
              </label>
              <input
                id="company"
                name="company"
                type="text"
                required
                defaultValue={contact.company ?? ""}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Acme Ltd"
              />
            </div>

            <div>
              <label
                htmlFor="status"
                className="block text-sm font-medium text-foreground"
              >
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={contact.status}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
                <option value="client">Client</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground"
              >
                Company email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={contact.email ?? ""}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="hello@acme.co.uk"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-foreground"
              >
                Company phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={contact.phone ?? ""}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="+44 20 7946 0000"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="first_name"
                className="block text-sm font-medium text-foreground"
              >
                Contact first name (optional)
              </label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                defaultValue={companyCustomer ? "" : contact.first_name}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="John"
              />
            </div>

            <div>
              <label
                htmlFor="last_name"
                className="block text-sm font-medium text-foreground"
              >
                Contact last name (optional)
              </label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                defaultValue={companyCustomer ? "" : contact.last_name}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Smith"
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="first_name"
                className="block text-sm font-medium text-foreground"
              >
                First Name <span className="text-destructive">*</span>
              </label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                required
                defaultValue={contact.first_name}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="John"
              />
            </div>

            <div>
              <label
                htmlFor="last_name"
                className="block text-sm font-medium text-foreground"
              >
                Last Name <span className="text-destructive">*</span>
              </label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                required
                defaultValue={contact.last_name}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={contact.email ?? ""}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-foreground"
              >
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={contact.phone ?? ""}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="+44 7700 900000"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="company"
                className="block text-sm font-medium text-foreground"
              >
                Company (optional)
              </label>
              <input
                id="company"
                name="company"
                type="text"
                defaultValue={contact.company ?? ""}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Acme Ltd"
              />
            </div>

            <div>
              <label
                htmlFor="status"
                className="block text-sm font-medium text-foreground"
              >
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={contact.status}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
                <option value="client">Client</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="tax_rate"
            className="block text-sm font-medium text-foreground"
          >
            VAT Rate (%)
          </label>
          <input
            id="tax_rate"
            name="tax_rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={contact.tax_rate ?? ""}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="0.00"
          />
        </div>

        <div className="flex items-center gap-2 pt-6">
          <input
            id="vat_registered"
            name="vat_registered"
            type="checkbox"
            defaultChecked={contact.vat_registered}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="vat_registered" className="text-sm font-medium text-foreground">
            VAT Registered
          </label>
        </div>
      </div>

      <div>
        <label
          htmlFor="address"
          className="block text-sm font-medium text-foreground"
        >
          Address
        </label>
        <textarea
          id="address"
          name="address"
          rows={3}
          defaultValue={contact.address ?? ""}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Street, town/city, postcode, country"
        />
      </div>

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-foreground"
        >
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={contact.notes ?? ""}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Any additional notes about this customer..."
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href={`/dashboard/contacts/${contact.id}`}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  )
}
