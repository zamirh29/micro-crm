import Link from "next/link"
import {
  Calculator,
  Landmark,
  ShieldAlert,
  Check,
  Crown,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { formatCurrency } from "@/lib/utils"
import {
  getTaxYearForDate,
  computeIncomeTax,
  assessMtdLiability,
  MTD_INCOME_TAX_SCHEDULE,
  formatPounds,
} from "@/lib/uk-tax"

export const dynamic = "force-dynamic"

export default async function TaxReportPage() {
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
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Crown className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Tax Reports are a Pro feature
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Track your UK income tax liability and find out when you&apos;ll be
            required to do Making Tax Digital — HMRC&apos;s digital tax returns.
            Upgrade to Pro to unlock UK tax reports.
          </p>
          <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
            {[
              "Estimated income tax on your invoiced income",
              "HMRC Making Tax Digital liability tracker",
              "Latest UK income tax bands and thresholds",
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-green-500" />
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/billing"
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Upgrade to Pro
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">
            First 3 months free on Pro. Cancel anytime.
          </p>
        </div>
      </div>
    )
  }

  const taxYear = getTaxYearForDate()

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, total, status, created_at")
    .eq("org_id", membership.org_id)
    .gte("created_at", taxYear.start.toISOString())
    .lt("created_at", taxYear.end.toISOString())
    .order("created_at", { ascending: false })

  const grossPence =
    invoices?.reduce(
      (sum, inv) => sum + (inv.status === "paid" ? inv.total : 0),
      0
    ) ?? 0

  const invoicedPence =
    invoices?.reduce(
      (sum, inv) =>
        sum +
        (inv.status === "paid" ||
        inv.status === "sent" ||
        inv.status === "overdue"
          ? inv.total
          : 0),
      0
    ) ?? 0

  const paidPence = grossPence
  const grossIncome = paidPence / 100
  const tax = computeIncomeTax(grossIncome)
  const mtd = assessMtdLiability(grossIncome)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Tax Report — {taxYear.label}
        </h1>
        <p className="text-sm text-muted-foreground">
          Estimated UK income tax and Making Tax Digital readiness based on your
          paid invoices.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Paid income ({taxYear.label})
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600 dark:bg-green-950">
              <Calculator className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold">
            {formatCurrency(paidPence)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Invoiced ({taxYear.label})
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950">
              <Landmark className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold">
            {formatCurrency(invoicedPence)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Estimated income tax
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950">
              <ShieldAlert className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold">{formatPounds(tax.totalTax)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ~{(tax.effectiveRate * 100).toFixed(1)}% of income
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">
            UK Income Tax Bands — {taxYear.label}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            England, Wales and Northern Ireland. Personal Allowance £12,570,
            tapered above £100,000. Bands frozen to April 2028.
          </p>
          <div className="mt-4 overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {tax.rows.map((row) => (
                  <tr key={row.band.label}>
                    <td className="px-4 py-2.5">{row.band.label}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {row.band.to
                        ? `${formatPounds(row.band.from)} – ${formatPounds(row.band.to)}`
                        : `${formatPounds(row.band.from)}+`}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {formatPounds(row.tax)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/50">
                  <td className="px-4 py-2.5 font-semibold">Total</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    On {formatPounds(grossIncome)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    {formatPounds(tax.totalTax)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Estimate only. Your real liability depends on expenses, allowances,
            and other income. Always confirm with HMRC or an accountant.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Making Tax Digital</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            HMRC requires most sole traders and landlords to keep digital
            records and submit quarterly updates.
          </p>

          {mtd.liable && mtd.stage ? (
            <div className="mt-4 rounded-md bg-green-50 p-4 text-sm dark:bg-green-950">
              <p className="font-semibold text-green-800 dark:text-green-300">
                You need to use Making Tax Digital for Income Tax
              </p>
              <p className="mt-1 text-green-700 dark:text-green-300">
                Based on {formatPounds(grossIncome)} income, you fall within
                MTD&apos;s {mtd.stage.mtdStart} requirement.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-md bg-amber-50 p-4 text-sm dark:bg-amber-950">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                Not yet required — but plan ahead
              </p>
              <p className="mt-1 text-amber-700 dark:text-amber-300">
                You&apos;re under the current MTD threshold. If your income
                rises above {formatPounds(mtd.nextStage?.threshold ?? 0)}, MTD
                will apply from{" "}
                {mtd.nextStage ? mtd.nextStage.mtdStart : "a future date"}.
              </p>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {MTD_INCOME_TAX_SCHEDULE.map((stage) => {
              const crossed = grossIncome > stage.threshold
              return (
                <div
                  key={stage.assessmentYear}
                  className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
                    crossed
                      ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950"
                      : "border-border"
                  }`}
                >
                  <Check
                    aria-hidden
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      crossed ? "text-green-600" : "text-muted-foreground"
                    }`}
                  />
                  <div>
                    <p className="font-medium">
                      From {stage.mtdStart} — income over{" "}
                      {formatPounds(stage.threshold)} (assessed on{" "}
                      {stage.assessmentYear} return)
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {stage.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}