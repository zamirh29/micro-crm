import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/api-auth"
import { jsonError } from "@/lib/api-utils"
import { getCompanyProfile, type SupabaseServer } from "@/lib/company"
import { isProUser } from "@/lib/pro"
import { monthBand, previousMonth } from "@/lib/report-dates"
import { runSalesReport, type ReportDb } from "@/lib/report-runner"

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.ok) return auth.response

  if (!(await isProUser(auth.supabase, auth.user.id))) {
    return jsonError("Month-End Reports are a Pro feature", 403)
  }

  const url = new URL(request.url)
  const requestedMonth = url.searchParams.get("month") || previousMonth()
  const customerId = url.searchParams.get("customer") || null

  const band = monthBand(requestedMonth) ?? monthBand(previousMonth())
  if (!band) return jsonError("month must be YYYY-MM", 400)

  const company = await getCompanyProfile(
    auth.supabase as unknown as SupabaseServer,
    auth.orgId
  )

  const summary = await runSalesReport(
    auth.supabase as unknown as ReportDb,
    auth.orgId,
    band,
    customerId
  )

  const grossProfit = summary.totals.paidTotal - summary.expenses.total
  const marginPct =
    summary.totals.paidTotal > 0
      ? (grossProfit / summary.totals.paidTotal) * 100
      : null

  return NextResponse.json({
    month: requestedMonth,
    label: band.label,
    customerId,
    includesSingleCustomer: summary.includesSingleCustomer,
    currency: company.currency,
    rows: summary.rows,
    totals: summary.totals,
    customers: summary.customers.map((customer) => ({
      id: customer.id,
      name: `${customer.first_name} ${customer.last_name}`.trim(),
    })),
    expenses: summary.expenses,
    grossProfit,
    marginPct,
  })
}
