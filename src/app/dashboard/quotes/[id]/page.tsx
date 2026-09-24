import { notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Send,
  FileText,
  Trash2,
  Download,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { getCompanyProfile } from "@/lib/company"
import type { QuoteStatus, QuoteItem } from "@/types/database"
import { sendQuote, deleteQuote, convertToInvoice } from "../actions"

const statusStyles: Record<QuoteStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-yellow-100 text-yellow-800",
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, contacts(*), quote_items(*)")
    .eq("id", id)
    .single()

  if (!quote) notFound()

  const contact = quote.contacts as {
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    company: string | null
  } | null

  const items = quote.quote_items as QuoteItem[]

  const company = await getCompanyProfile(supabase, quote.org_id)

  const companyLines = [
    company.address,
    company.phone,
    company.email,
    company.website,
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {company.logoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.logoData}
                alt={company.name}
                className="h-14 w-14 rounded-md object-contain"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-md bg-primary/10">
                <span className="text-lg font-bold text-primary">
                  {company.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <p className="text-lg font-bold">{company.name}</p>
              {companyLines.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {companyLines.join(" • ")}
                </p>
              )}
            </div>
          </div>
          <a
            href={`/api/quotes/${quote.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            PDF
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/quotes"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {quote.number}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                  statusStyles[quote.status as QuoteStatus]
                )}
              >
                {quote.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{quote.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {quote.status === "draft" && (
            <form action={sendQuote.bind(null, quote.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </form>
          )}
          {(quote.status === "sent" || quote.status === "accepted") && (
            <form action={convertToInvoice.bind(null, quote.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <FileText className="h-4 w-4" />
                Convert to Invoice
              </button>
            </form>
          )}
          <form action={deleteQuote.bind(null, quote.id)}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-border bg-card shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Line Items</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-left font-medium text-muted-foreground">
                      Description
                    </th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">
                      Qty
                    </th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">
                      Unit Price
                    </th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-3 text-foreground">
                        {item.description}
                      </td>
                      <td className="py-3 text-right">{item.quantity}</td>
                      <td className="py-3 text-right">
                        {formatCurrency(item.unit_price, quote.currency)}
                      </td>
                      <td className="py-3 text-right font-medium">
                        {formatCurrency(item.total, quote.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {quote.description && (
            <div className="rounded-lg border border-border bg-card shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-2">Description</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {quote.description}
              </p>
            </div>
          )}

          {quote.notes && (
            <div className="rounded-lg border border-border bg-card shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-2">Notes</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {quote.notes}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Summary</h2>
            <dl className="space-y-3">
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium">
                  {formatCurrency(quote.subtotal, quote.currency)}
                </dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">
                  Tax ({quote.tax_rate}%)
                </dt>
                <dd className="font-medium">
                  {formatCurrency(quote.tax_amount, quote.currency)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatCurrency(quote.total, quote.currency)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-card shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(quote.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Valid Until</dt>
                <dd>{formatDate(quote.valid_until)}</dd>
              </div>
              {contact && (
                <>
                  <div className="border-t border-border pt-3">
                    <dt className="text-muted-foreground mb-1">Customer</dt>
                    <dd className="font-medium">
                      {contact.first_name} {contact.last_name}
                    </dd>
                    {contact.company && (
                      <dd className="text-muted-foreground">
                        {contact.company}
                      </dd>
                    )}
                  </div>
                  {contact.email && (
                    <div>
                      <dt className="text-muted-foreground">Email</dt>
                      <dd>{contact.email}</dd>
                    </div>
                  )}
                  {contact.phone && (
                    <div>
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd>{contact.phone}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
