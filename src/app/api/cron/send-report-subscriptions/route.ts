import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail } from "@/lib/resend"
import { formatCurrency } from "@/lib/utils"
import { toDateInput, type DateBand } from "@/lib/report-dates"
import {
  isDue,
  periodLabel,
  type ReportSubscriptionRow,
} from "@/lib/report-subscriptions"
import { runSalesReport } from "@/lib/report-runner"
import { reportEmail } from "@/components/email/report-email"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  const { data: subscriptions } = await supabase
    .from("report_subscriptions")
    .select("*, organizations(name, currency)")
    .eq("enabled", true)

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  let sentCount = 0

  for (const sub of subscriptions) {
    const { due, key } = isDue(
      sub as unknown as ReportSubscriptionRow,
      now
    )
    if (!due || !key) continue

    const org = sub.organizations as { name: string; currency: string } | null
    const band = bandForSubscription(sub, now)
    const result = await runSalesReport(
      supabase,
      sub.org_id,
      band,
      null
    )

    const currency = org?.currency ?? "GBP"
    const companyName = org?.name ?? "MicroCRM"
    const isMonthEnd = sub.report_type === "month_end"
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

    const reportTitle = isMonthEnd ? "Month-End Report" : "Sales Report"
    const viewUrl = isMonthEnd
      ? `${baseUrl}/dashboard/reports/month-end`
      : `${baseUrl}/dashboard/reports/customers`

    const activeRows = result.rows.filter(
      (r) =>
        r.quoteCount > 0 ||
        r.invoiceCount > 0 ||
        r.paidTotal > 0 ||
        r.unpaidTotal > 0
    )

    const rows: string[][] = activeRows.map((r) => [
      r.name,
      String(r.quoteCount),
      formatCurrency(r.quotedTotal, currency),
      String(r.invoiceCount),
      formatCurrency(r.invoicedTotal, currency),
      formatCurrency(r.paidTotal, currency),
      formatCurrency(r.unpaidTotal, currency),
    ])

    rows.push([
      "Totals",
      String(result.totals.quoteCount),
      formatCurrency(result.totals.quotedTotal, currency),
      String(result.totals.invoiceCount),
      formatCurrency(result.totals.invoicedTotal, currency),
      formatCurrency(result.totals.paidTotal, currency),
      formatCurrency(result.totals.unpaidTotal, currency),
    ])

    const html = reportEmail({
      companyName,
      reportTitle,
      periodLabel: periodLabel(sub, now),
      currency,
      cards: [
        { label: "Quoted", value: formatCurrency(result.totals.quotedTotal, currency) },
        { label: "Invoiced", value: formatCurrency(result.totals.invoicedTotal, currency) },
        { label: isMonthEnd ? "Collected" : "Paid", value: formatCurrency(result.totals.paidTotal, currency) },
        { label: "Outstanding", value: formatCurrency(result.totals.unpaidTotal, currency) },
      ],
      headers: [
        "Customer",
        "Quotes",
        "Quoted",
        "Invoices",
        "Invoiced",
        isMonthEnd ? "Collected" : "Paid",
        "Outstanding",
      ],
      rows,
      viewUrl,
    })

    const email = sub.email || (org as { email?: string } | null)?.email
    if (!email) continue

    const resultEmail = await sendEmail({
      to: [email],
      subject: `${companyName} — ${reportTitle} for ${periodLabel(sub, now)}`,
      html,
    })

    if (!resultEmail.error) {
      await supabase
        .from("report_subscriptions")
        .update({
          last_run_key: key,
          last_run_at: now.toISOString(),
        })
        .eq("id", sub.id)
      sentCount++
    }
  }

  return NextResponse.json({ sent: sentCount })
}

function bandForSubscription(
  sub: Pick<ReportSubscriptionRow, "report_type" | "frequency">,
  now: Date
): DateBand {
  const to = new Date(now)
  to.setDate(to.getDate() + 1)
  to.setHours(0, 0, 0, 0)

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  if (sub.report_type === "month_end") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const label = now.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    })
    return { from, to, label }
  }

  switch (sub.frequency) {
    case "daily": {
      const label = now.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
      return { from: startOfToday, to, label }
    }
    case "weekly": {
      const from = new Date(startOfToday)
      from.setDate(from.getDate() - 6)
      const label = `${from.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })} – ${now.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`
      return { from, to, label }
    }
    case "monthly": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      const label = now.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      })
      return { from, to, label }
    }
    default:
      return { from: startOfToday, to, label: toDateInput(now) }
  }
}