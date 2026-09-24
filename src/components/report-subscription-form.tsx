"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, Loader2 } from "lucide-react"
import { addReportSubscription } from "@/app/dashboard/reports/subscriptions/actions"

interface ReportSubscriptionFormProps {
  defaultEmail: string
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

export default function ReportSubscriptionForm({
  defaultEmail,
}: ReportSubscriptionFormProps) {
  const router = useRouter()
  const [reportType, setReportType] = useState<"sales" | "month_end">("sales")
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">(
    "weekly"
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const isMonthEnd = reportType === "month_end"

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    const formData = new FormData(e.currentTarget)
    formData.set("report_type", reportType)
    formData.set("frequency", isMonthEnd ? "monthly" : frequency)

    startTransition(async () => {
      const result = await addReportSubscription(null, formData)
      if ("error" in result) {
        setError(result.error)
      } else {
        setMessage(result.success)
        router.refresh()
      }
    })
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:ring-2 focus:ring-ring"

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-6 shadow-sm"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CalendarClock className="h-5 w-5 text-indigo-500" />
        New report subscription
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        We&apos;ll email the report automatically on your schedule.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Report</label>
          <select
            name="report_type"
            className={inputClass}
            value={reportType}
            onChange={(e) =>
              setReportType(e.target.value as "sales" | "month_end")
            }
          >
            <option value="sales">Sales Report</option>
            <option value="month_end">Month-End Report</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Frequency</label>
          {isMonthEnd ? (
            <div className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Monthly — last day of each month
            </div>
          ) : (
            <select
              name="frequency"
              className={inputClass}
              value={frequency}
              onChange={(e) =>
                setFrequency(
                  e.target.value as "daily" | "weekly" | "monthly"
                )
              }
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          )}
        </div>

        {!isMonthEnd && frequency === "weekly" && (
          <div>
            <label className="text-sm font-medium">Day of week</label>
            <select name="day_of_week" className={inputClass} defaultValue="1">
              {DAYS.map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isMonthEnd && frequency === "monthly" && (
          <div>
            <label className="text-sm font-medium">Day of month</label>
            <input
              type="number"
              name="day_of_month"
              min={1}
              max={28}
              defaultValue={1}
              className={inputClass}
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Send report to</label>
          <input
            type="email"
            name="email"
            defaultValue={defaultEmail}
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-600 dark:bg-green-950">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarClock className="h-4 w-4" />
        )}
        {isMonthEnd ? "Schedule month-end report" : "Schedule sales report"}
      </button>
    </form>
  )
}