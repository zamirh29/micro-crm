"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { toDateInput } from "@/lib/report-dates"

interface ReportFiltersProps {
  variant: "range" | "month"
  customers: { id: string; name: string }[]
  initialFrom?: string
  initialTo?: string
  initialMonth?: string
  initialCustomerId?: string
  basePath: string
}

interface Preset {
  label: string
  from: string
  to: string
}

function today(): Date {
  return new Date()
}

export default function ReportFilters({
  variant,
  customers,
  initialFrom = "",
  initialTo = "",
  initialMonth = "",
  initialCustomerId = "",
  basePath,
}: ReportFiltersProps) {
  const router = useRouter()
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [month, setMonth] = useState(initialMonth)
  const [customerId, setCustomerId] = useState(initialCustomerId)

  function navigate(f: string, t: string, m: string, c: string) {
    const params = new URLSearchParams()
    if (f) params.set("from", f)
    if (t) params.set("to", t)
    if (m) params.set("month", m)
    if (c) params.set("customer", c)
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  function applyPreset(preset: Preset) {
    setFrom(preset.from)
    setTo(preset.to)
    navigate(preset.from, preset.to, "", customerId)
  }

  function apply() {
    if (variant === "range") {
      navigate(from, to, "", customerId)
    } else {
      navigate("", "", month, customerId)
    }
  }

  const presets: Preset[] = []
  if (variant === "range") {
    const now = today()
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    const threeMonthsStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)
    presets.push(
      { label: "This month", from: toDateInput(firstOfMonth), to: toDateInput(now) },
      { label: "Last month", from: toDateInput(lastMonthStart), to: toDateInput(lastMonthEnd) },
      { label: "Last 3 months", from: toDateInput(threeMonthsStart), to: toDateInput(now) },
      { label: "This year", from: toDateInput(yearStart), to: toDateInput(now) },
      { label: "All time", from: "", to: "" }
    )
  }

  const inputClass =
    "h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      {variant === "range" && (
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {variant === "range" ? (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground">
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground">
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={inputClass}
              />
            </div>
          </>
        ) : (
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Month
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        <div className="min-w-56">
          <label className="block text-xs font-medium text-muted-foreground">
            Customer
          </label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className={inputClass + " w-full"}
          >
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={apply}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Search className="h-4 w-4" />
          Run Report
        </button>
      </div>
    </div>
  )
}