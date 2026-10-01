import Link from "next/link"
import {
  FileText,
  Receipt,
  Wallet,
  TriangleAlert,
  CalendarCheck,
  Coins,
  PiggyBank,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getCompanyProfile } from "@/lib/company"
import { formatCurrency } from "@/lib/utils"
import { monthBand, previousMonth } from "@/lib/report-dates"
import { runSalesReport } from "@/lib/report-runner"
import ProGate from "@/components/pro-gate"
import ReportFilters from "@/components/report-filters"
import ExportCsvButton from "@/components/export-csv-button"

export const dynamic = "force-dynamic"

export default async function MonthEndReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; customer?: string }>
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
        title="Month-End Reports are a Pro feature"
        description="Get a snapshot of every month: what you quoted, invoiced, collected and still have outstanding — per customer."
        features={[
          "Monthly sales snapshot for any month",
          "Per-customer quoted, invoiced, paid and outstanding totals",
          "Costs, gross profit and margin for the month",
          "Review last month, any past month, or plan the current one",
        ]}
      />
    )
  }

  const company = await getCompanyProfile(supabase, membership.org_id)
  const selectedMonth = params.month || previousMonth()
  const band = monthBand(selectedMonth) ?? monthBand(previousMonth())!
  const customerId = params.customer || null

  const summary = await runSalesReport(
    supabase,
    membership.org_id,
    band,
    customerId
  )

  const customers = summary.customers

  const costsTotal = summary.expenses.total
  const grossProfit = summary.totals.paidTotal - costsTotal
  const marginPct =
    summary.totals.paidTotal > 0
      ? (grossProfit / summary.totals.paidTotal) * 100
      : null

  const cards = [
    {
      label: `Quoted — ${band.label}`,
      value: summary.totals.quotedTotal,
      icon: FileText,
      bg: "bg-blue-50 text-blue-600 dark:bg-blue-950",
    },
    {
      label: `Invoiced — ${band.label}`,
      value: summary.totals.invoicedTotal,
      icon: Receipt,
      bg: "bg-amber-50 text-amber-600 dark:bg-amber-950",
    },
    {
      label: `Collected — ${band.label}`,
      value: summary.totals.paidTotal,
      icon: Wallet,
      bg: "bg-green-50 text-green-600 dark:bg-green-950",
    },
    {
      label: `Outstanding at month end`,
      value: summary.totals.unpaidTotal,
      icon: TriangleAlert,
      bg: "bg-red-50 text-red-600 dark:bg-red-950",
    },
    {
      label: `Costs — ${band.label}`,
      value: costsTotal,
      icon: Coins,
      bg: "bg-orange-50 text-orange-600 dark:bg-orange-950",
    },
    {
      label: "Gross profit",
      value: grossProfit,
      icon: PiggyBank,
      bg:
        grossProfit >= 0
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950"
          : "bg-red-50 text-red-600 dark:bg-red-950",
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
  const csvRows: (string | number)[][] = summary.rows.map((r) => [
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

  csvRows.push([])
  csvRows.push(["SUMMARY", "", "", "", "", "", "", "", ""])
  csvRows.push(["", "", "", "", "", "", "Total collected", summary.totals.paidTotal])
  for (const category of summary.expenses.byCategory) {
    csvRows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      `Costs — ${category.category}`,
      category.amount,
    ])
  }
  csvRows.push(["", "", "", "", "", "", "Total costs", costsTotal])
  csvRows.push(["", "", "", "", "", "", "Gross profit", grossProfit])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Month-End Report — {band.label}
          </h1>
          <p className="text-sm text-muted-foreground">
            {summary.includesSingleCustomer
              ? `Sales snapshot for a single customer in ${band.label}.`
              : `Sales snapshot for ${band.label}.`}
          </p>
        </div>
        <ExportCsvButton
          filename={`month-end-${selectedMonth}.csv`}
          headers={csvHeaders}
          rows={csvRows}
          disabled={summary.rows.length === 0}
        />
      </div>

      <ReportFilters
        variant="month"
        customers={customerOptions}
        initialMonth={selectedMonth}
        initialCustomerId={customerId ?? ""}
        basePath="/dashboard/reports/month-end"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              Costs and profit — {band.label}
            </h2>
            <p className="text-sm text-muted-foreground">
              {marginPct === null
                ? "No payments collected this month, so no margin can be calculated."
                : `Collected ${formatCurrency(
                    summary.totals.paidTotal,
                    company.currency
                  )} less ${formatCurrency(
                    costsTotal,
                    company.currency
                  )} of costs leaves a gross margin of ${marginPct.toFixed(1)}%.`}
            </p>
          </div>
          <Link
            href="/dashboard/expenses"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Coins className="h-4 w-4" />
            Manage expenses
          </Link>
        </div>

        {summary.expenses.byCategory.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">
                    Category
                  </th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">
                    Amount
                  </th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.expenses.byCategory.map((category) => {
                  const share =
                    costsTotal > 0 ? (category.amount / costsTotal) * 100 : 0
                  return (
                    <tr
                      key={category.category}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2 font-medium">{category.category}</td>
                      <td className="py-2 text-right">
                        {formatCurrency(category.amount, company.currency)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {share.toFixed(0)}%
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-border">
                  <td className="py-2 font-semibold">Total costs</td>
                  <td className="py-2 text-right font-semibold">
                    {formatCurrency(costsTotal, company.currency)}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No costs recorded in {band.label}.{" "}
            <Link
              href="/dashboard/expenses"
              className="underline underline-offset-2"
            >
              Add this month&apos;s expenses
            </Link>{" "}
            to see your true profit for the month.
          </p>
        )}
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
                  Collected
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
                    No sales activity in {band.label}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarCheck className="h-4 w-4 shrink-0" />
        <p>
          Quoted excludes drafts and rejected quotes. Invoiced excludes drafts.
          Outstanding is the value of sent and overdue invoices created in{" "}
          {band.label}. Collected counts payments received during the month.
          Costs are business expenses incurred in the month, so gross profit is
          what you actually kept.
        </p>
      </div>
    </div>
  )
}