import {
  FileText,
  Receipt,
  Wallet,
  TriangleAlert,
  Users,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getCompanyProfile } from "@/lib/company"
import { formatCurrency } from "@/lib/utils"
import { parseDateBand } from "@/lib/report-dates"
import {
  computeCustomerSales,
  type CustomerBrief,
} from "@/lib/sales-report"
import ProGate from "@/components/pro-gate"
import ReportFilters from "@/components/report-filters"
import ExportCsvButton from "@/components/export-csv-button"

export const dynamic = "force-dynamic"

export default async function CustomerReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; customer?: string }>
}) {
  const params = await searchParams
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

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, plan")
    .eq("user_id", user.id)
    .maybeSingle()

  const isPro =
    subscription?.status === "active" || subscription?.status === "trialing"
      ? (subscription.plan ?? "free") === "pro"
      : false

  if (!isPro) {
    return (
      <ProGate
        title="Sales Reports are a Pro feature"
        description="See exactly what each customer is worth. Analyse quotes, invoices, payments and outstanding balances over any date range."
        features={[
          "Per-customer sales totals over any date band",
          "Quotes, invoices, payments and outstanding balances",
          "Monthly presets or custom date ranges",
        ]}
      />
    )
  }

  const company = await getCompanyProfile(supabase, membership.org_id)
  const band = parseDateBand(params.from, params.to)
  const customerId = params.customer || null

  const [{ data: contacts }, quotesResult, invoicesCreated, invoicesPaid] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email, company")
        .eq("org_id", membership.org_id)
        .order("first_name"),
      fetchQuotes(supabase, membership.org_id, band, customerId),
      fetchInvoicesCreated(supabase, membership.org_id, band, customerId),
      fetchInvoicesPaid(supabase, membership.org_id, band, customerId),
    ])

  const customers = (contacts ?? []) as CustomerBrief[]
  const summary = computeCustomerSales({
    customers,
    quotes: quotesResult,
    invoicesCreated,
    invoicesPaid,
  })

  const cards = [
    {
      label: `Quoted (${band.label})`,
      value: summary.totals.quotedTotal,
      icon: FileText,
      bg: "bg-blue-50 text-blue-600 dark:bg-blue-950",
    },
    {
      label: `Invoiced (${band.label})`,
      value: summary.totals.invoicedTotal,
      icon: Receipt,
      bg: "bg-amber-50 text-amber-600 dark:bg-amber-950",
    },
    {
      label: `Paid (${band.label})`,
      value: summary.totals.paidTotal,
      icon: Wallet,
      bg: "bg-green-50 text-green-600 dark:bg-green-950",
    },
    {
      label: `Outstanding (${band.label})`,
      value: summary.totals.unpaidTotal,
      icon: TriangleAlert,
      bg: "bg-red-50 text-red-600 dark:bg-red-950",
    },
  ]

  const customerOptions = customers.map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`.trim(),
  }))

  const csvHeaders = [
    "Customer",
    "Company",
    "Email",
    "Quotes",
    "Quoted Value",
    "Invoices",
    "Invoiced Value",
    "Paid",
    "Outstanding",
  ]
  const csvRows = summary.rows.map((r) => [
    r.name,
    r.company ?? "",
    r.email ?? "",
    r.quoteCount,
    r.quotedTotal,
    r.invoiceCount,
    r.invoicedTotal,
    r.paidTotal,
    r.unpaidTotal,
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Report</h1>
          <p className="text-sm text-muted-foreground">
            {summary.includesSingleCustomer
              ? `Sales activity for a single customer — ${band.label}.`
              : `Customer sales activity for ${band.label}.`}
          </p>
        </div>
        <ExportCsvButton
          filename="sales-report.csv"
          headers={csvHeaders}
          rows={csvRows}
          disabled={summary.rows.length === 0}
        />
      </div>

      <ReportFilters
        variant="range"
        customers={customerOptions}
        initialFrom={params.from ?? ""}
        initialTo={params.to ?? ""}
        initialCustomerId={customerId ?? ""}
        basePath="/dashboard/reports/customers"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-card p-6"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {card.label}
              </span>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.bg}`}
              >
                <card.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(card.value, company.currency)}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Customer
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Quotes
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Quoted
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Invoices
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Invoiced
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Paid
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Outstanding
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.length > 0 ? (
                summary.rows.map((row) => (
                  <tr
                    key={row.contactId}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.name}</p>
                      {row.company && (
                        <p className="text-xs text-muted-foreground">
                          {row.company}
                          {row.email ? ` · ${row.email}` : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{row.quoteCount}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(row.quotedTotal, company.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.invoiceCount}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(row.invoicedTotal, company.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(row.paidTotal, company.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-red-600 dark:text-red-400">
                      {row.unpaidTotal > 0
                        ? formatCurrency(row.unpaidTotal, company.currency)
                        : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No sales activity in the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-4 w-4 shrink-0" />
        <p>
          Quoted excludes drafts and rejected quotes. Invoiced excludes drafts.
          Outstanding is the value of sent and overdue invoices created in the
          period. Paid counts payments received in the period.
        </p>
      </div>
    </div>
  )
}

async function fetchQuotes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  band: { from: Date | null; to: Date | null },
  customerId: string | null
) {
  let q = supabase
    .from("quotes")
    .select("contact_id, status, total")
    .eq("org_id", orgId)
  if (band.from) q = q.gte("created_at", band.from.toISOString())
  if (band.to) q = q.lt("created_at", band.to.toISOString())
  if (customerId) q = q.eq("contact_id", customerId)
  const { data } = await q
  return data ?? []
}

async function fetchInvoicesCreated(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  band: { from: Date | null; to: Date | null },
  customerId: string | null
) {
  let q = supabase
    .from("invoices")
    .select("contact_id, status, total")
    .eq("org_id", orgId)
  if (band.from) q = q.gte("created_at", band.from.toISOString())
  if (band.to) q = q.lt("created_at", band.to.toISOString())
  if (customerId) q = q.eq("contact_id", customerId)
  const { data } = await q
  return data ?? []
}

async function fetchInvoicesPaid(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  band: { from: Date | null; to: Date | null },
  customerId: string | null
) {
  let q = supabase
    .from("invoices")
    .select("contact_id, total")
    .eq("org_id", orgId)
    .eq("status", "paid")
  if (band.from) q = q.gte("paid_at", band.from.toISOString())
  if (band.to) q = q.lt("paid_at", band.to.toISOString())
  if (customerId) q = q.eq("contact_id", customerId)
  const { data } = await q
  return data ?? []
}