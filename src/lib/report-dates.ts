export function toDateInput(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function toMonthInput(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

export interface DateBand {
  from: Date | null
  to: Date | null
  label: string
}

export function parseDateBand(
  from: string | undefined,
  to: string | undefined
): DateBand {
  const fromDate = from && /^\d{4}-\d{2}-\d{2}$/.test(from)
    ? new Date(`${from}T00:00:00`)
    : null

  let toExclusive: Date | null = null
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const d = new Date(`${to}T00:00:00`)
    d.setDate(d.getDate() + 1)
    toExclusive = d
  }

  let label = "All time"
  if (fromDate && toExclusive) {
    label = `${from} – ${to}`
  } else if (fromDate) {
    label = `From ${from}`
  } else if (toExclusive) {
    label = `Up to ${to}`
  }

  return { from: fromDate, to: toExclusive, label }
}

export function monthBand(month: string): DateBand | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  const [year, m] = month.split("-").map(Number)
  const from = new Date(year, m - 1, 1)
  const to = new Date(year, m, 1)
  const label = from.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  })
  return { from, to, label }
}

export function previousMonth(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return toMonthInput(prev)
}