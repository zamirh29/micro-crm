import { Mail, MailCheck, MailX, Pause, Play, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import ProGate from "@/components/pro-gate"
import ReportSubscriptionForm from "@/components/report-subscription-form"
import {
  deleteReportSubscription,
  toggleReportSubscription,
} from "./actions"
import type { ReportSubscriptionRow } from "@/lib/report-subscriptions"

export const dynamic = "force-dynamic"

export default async function ReportSubscriptionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id, role")
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
        title="Automated report emails are a Pro feature"
        description="Have your Sales Report and Month-End Report emailed to you automatically — daily, weekly or monthly."
        features={[
          "Daily, weekly or monthly Sales Reports",
          "Month-End Report on the last day of every month",
          "Delivered straight to your inbox",
        ]}
      />
    )
  }

  const { data: subs } = await supabase
    .from("report_subscriptions")
    .select("*")
    .eq("org_id", membership.org_id)
    .order("created_at")

  const subscriptions = (subs ?? []) as ReportSubscriptionRow[]

  const scheduleLabels: Record<string, (s: ReportSubscriptionRow) => string> = {
    sales: (s) => {
      if (s.frequency === "daily") return "Every day"
      if (s.frequency === "weekly") {
        const days = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ]
        return `Every ${days[s.day_of_week ?? 1]}`
      }
      return `On the ${s.day_of_month ?? 1}${ordinal(s.day_of_month ?? 1)} of each month`
    },
    month_end: () => "Last day of each month",
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Report subscriptions
        </h1>
        <p className="text-sm text-muted-foreground">
          Get your Sales and Month-End Reports emailed automatically.
        </p>
      </div>

      <ReportSubscriptionForm defaultEmail={user.email ?? ""} />

      <div className="space-y-3">
        {subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <Mail className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No report subscriptions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create one above to start receiving automated reports.
            </p>
          </div>
        ) : (
          subscriptions.map((sub) => {
            const isMonthEnd = sub.report_type === "month_end"
            const label = isMonthEnd
              ? "Month-End Report"
              : sub.frequency === "daily"
                ? "Sales Report"
                : sub.frequency === "weekly"
                  ? "Weekly Sales Report"
                  : "Monthly Sales Report"
            return (
              <div
                key={sub.id}
                className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    {sub.enabled ? (
                      <MailCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <MailX className="h-4 w-4 text-muted-foreground" />
                    )}
                    {label}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        sub.enabled
                          ? "bg-green-100 text-green-700 dark:bg-green-950"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {sub.enabled ? "Active" : "Paused"}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {scheduleLabels[sub.report_type]?.(sub)} · sent to{" "}
                    {sub.email}
                    {sub.last_run_at
                      ? ` · last sent ${formatDate(sub.last_run_at)}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form action={toggleReportSubscription.bind(null, sub.id)}>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                      title={sub.enabled ? "Pause" : "Resume"}
                    >
                      {sub.enabled ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      {sub.enabled ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={deleteReportSubscription.bind(null, sub.id)}>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                      title="Delete subscription"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        <p className="font-medium">
          How scheduling works
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            Sales Report — daily reports cover that day, weekly cover the last
            7 days, monthly cover the current calendar month.
          </li>
          <li>
            Month-End Report — sent on the last day of each month and covers
            that month.
          </li>
          <li>
            Reports are sent once per period. Your subscription must be enabled
            for a report to go out.
          </li>
        </ul>
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const ordinals = ["", "st", "nd", "rd", "th", "th", "th", "th", "th", "th", "th", "th", "th", "th", "th", "th", "th", "th", "th", "th", "th", "st", "nd", "rd", "th", "th", "th", "th", "th"]
  return ordinals[n] ?? "th"
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}