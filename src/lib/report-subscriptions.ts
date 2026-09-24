import { toDateInput, toMonthInput } from "@/lib/report-dates"

export type ReportType = "sales" | "month_end"
export type ReportFrequency = "daily" | "weekly" | "monthly"

export interface ReportSubscriptionRow {
  id: string
  org_id: string
  created_by: string | null
  report_type: ReportType
  frequency: ReportFrequency
  day_of_week: number | null
  day_of_month: number | null
  email: string
  enabled: boolean
  last_run_key: string | null
  last_run_at: string | null
  created_at: string
}

export function isLastDayOfMonth(date: Date): boolean {
  const d = new Date(date)
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const last = new Date(next.getTime() - 1)
  return d.getDate() === last.getDate()
}

export function weekKey(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return `week:${toDateInput(monday)}`
}

export function dayKey(date: Date): string {
  return `day:${toDateInput(date)}`
}

export function monthKey(date: Date): string {
  return `month:${toMonthInput(date)}`
}

export function expectedRunKey(
  sub: Pick<
    ReportSubscriptionRow,
    "report_type" | "frequency" | "day_of_week" | "day_of_month"
  >,
  now: Date
): string | null {
  if (sub.report_type === "month_end") {
    if (isLastDayOfMonth(now)) return monthKey(now)
    return null
  }

  switch (sub.frequency) {
    case "daily":
      return dayKey(now)
    case "weekly":
      if (sub.day_of_week === now.getDay()) return weekKey(now)
      return null
    case "monthly":
      if (sub.day_of_month === now.getDate()) return monthKey(now)
      return null
    default:
      return null
  }
}

export function isDue(
  sub: ReportSubscriptionRow,
  now: Date
): { due: boolean; key: string | null } {
  if (!sub.enabled) return { due: false, key: null }
  const key = expectedRunKey(sub, now)
  if (!key) return { due: false, key: null }
  return { due: sub.last_run_key !== key, key }
}

export function periodLabel(
  sub: Pick<ReportSubscriptionRow, "report_type" | "frequency">,
  now: Date
): string {
  if (sub.report_type === "month_end") {
    return now.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    })
  }
  switch (sub.frequency) {
    case "daily":
      return now.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    case "weekly": {
      const from = new Date(now)
      from.setDate(from.getDate() - 6)
      return `${from.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })} – ${now.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`
    }
    case "monthly":
      return now.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      })
    default:
      return ""
  }
}