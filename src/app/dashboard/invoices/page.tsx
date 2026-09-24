import Link from "next/link"
import { Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import type { InvoiceStatus } from "@/types/database"
import ExportCsvButton from "@/components/export-csv-button"

const statusStyles: Record<InvoiceStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
}

export default async function InvoicesPage() {
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

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, contacts(first_name, last_name, company)")
    .eq("org_id", membership.org_id)
    .order("created_at", { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Manage your invoices and track payments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportCsvButton
            filename="invoices.csv"
            headers={[
              "Number",
              "Title",
              "Customer",
              "Company",
              "Total",
              "Currency",
              "Status",
              "Due Date",
              "Created",
            ]}
            rows={
              invoices
                ? invoices.map((inv) => {
                    const contact = inv.contacts as {
                      first_name: string
                      last_name: string
                      company: string | null
                    } | null
                    return [
                      inv.number,
                      inv.title,
                      contact
                        ? `${contact.first_name} ${contact.last_name}`
                        : "",
                      contact?.company ?? "",
                      inv.total,
                      inv.currency,
                      inv.status,
                      formatDate(inv.due_date),
                      formatDate(inv.created_at),
                    ]
                  })
                : []
            }
            disabled={!invoices || invoices.length === 0}
          />
          <Link
            href="/dashboard/invoices/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Invoice
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Number
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Title
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Customer
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Total
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Due Date
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices && invoices.length > 0 ? (
                invoices.map((invoice) => {
                  const contact = invoice.contacts as {
                    first_name: string
                    last_name: string
                    company: string | null
                  } | null
                  return (
                    <tr
                      key={invoice.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/invoices/${invoice.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {invoice.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {invoice.title}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {contact
                          ? `${contact.first_name} ${contact.last_name}`
                          : "\u2014"}
                        {contact?.company && (
                          <span className="block text-xs text-muted-foreground">
                            {contact.company}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(invoice.total, invoice.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                            statusStyles[invoice.status as InvoiceStatus]
                          )}
                        >
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(invoice.due_date)}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No invoices yet. Create your first invoice to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
