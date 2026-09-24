import { notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Send,
  CheckCircle,
  Trash2,
  Download,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { getCompanyProfile } from "@/lib/company"
import type { InvoiceStatus, InvoiceItem } from "@/types/database"
import { sendInvoice, deleteInvoice, markAsPaid } from "../actions"

const statusStyles: Record<InvoiceStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
}

export default async function InvoiceDetailPage({
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

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, contacts(*), invoice_items(*)")
    .eq("id", id)
    .single()

  if (!invoice) notFound()

  const contact = invoice.contacts as {
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    company: string | null
  } | null

  const items = invoice.invoice_items as InvoiceItem[]

  const company = await getCompanyProfile(supabase, invoice.org_id)

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
            href={`/api/invoices/${invoice.id}/pdf`}
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
            href="/dashboard/invoices"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {invoice.number}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                  statusStyles[invoice.status as InvoiceStatus]
                )}
              >
                {invoice.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{invoice.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {invoice.status === "draft" && (
            <form action={sendInvoice.bind(null, invoice.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </form>
          )}
          {invoice.status === "sent" && (
            <form action={markAsPaid.bind(null, invoice.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4" />
                Mark as Paid
              </button>
            </form>
          )}
          <form action={deleteInvoice.bind(null, invoice.id)}>
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
                        {formatCurrency(item.unit_price, invoice.currency)}
                      </td>
                      <td className="py-3 text-right font-medium">
                        {formatCurrency(item.total, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {invoice.description && (
            <div className="rounded-lg border border-border bg-card shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-2">Description</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {invoice.description}
              </p>
            </div>
          )}

          {invoice.notes && (
            <div className="rounded-lg border border-border bg-card shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-2">Notes</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {invoice.notes}
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
                  {formatCurrency(invoice.subtotal, invoice.currency)}
                </dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">
                  Tax ({invoice.tax_rate}%)
                </dt>
                <dd className="font-medium">
                  {formatCurrency(invoice.tax_amount, invoice.currency)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatCurrency(invoice.total, invoice.currency)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-card shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(invoice.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Due Date</dt>
                <dd>{formatDate(invoice.due_date)}</dd>
              </div>
              {invoice.paid_at && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd>{formatDate(invoice.paid_at)}</dd>
                </div>
              )}
              {contact && (
                <>
                  <div className="border-t border-border pt-3">
                    <dt className="text-muted-foreground mb-1">Bill To</dt>
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
