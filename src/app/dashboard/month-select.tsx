"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const SELECT_CLASS =
  "rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"

export default function MonthSelect({ month }: { month: string }) {
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  const [monthIndex, setMonthIndex] = useState(Number(month.slice(5, 7)) - 1)
  const router = useRouter()

  const currentYear = new Date().getFullYear()
  const years = Array.from(
    { length: 5 },
    (_, i) => currentYear - 3 + i
  )

  function go(nextYear: number, nextMonthIndex: number) {
    router.push(
      `/dashboard/expenses?month=${nextYear}-${String(nextMonthIndex + 1).padStart(2, "0")}`
    )
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Month"
        value={monthIndex}
        onChange={(e) => {
          const next = Number(e.target.value)
          setMonthIndex(next)
          go(year, next)
        }}
        className={SELECT_CLASS}
      >
        {MONTHS.map((name, index) => (
          <option key={name} value={index}>
            {name}
          </option>
        ))}
      </select>

      <select
        aria-label="Year"
        value={year}
        onChange={(e) => {
          const next = Number(e.target.value)
          setYear(next)
          go(next, monthIndex)
        }}
        className={SELECT_CLASS}
      >
        {years.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}
