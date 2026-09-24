"use client"

import { useMemo, useState } from "react"
import { SlidersHorizontal, Calculator } from "lucide-react"
import {
  computeIncomeTax,
  assessMtdLiability,
  getTaxYearForDate,
  formatPounds,
  type TaxBandRow,
} from "@/lib/uk-tax"

interface TaxEstimatorProps {
  initialIncome: number
}

export default function TaxEstimator({ initialIncome }: TaxEstimatorProps) {
  const [income, setIncome] = useState<number>(Math.max(0, initialIncome))
  const [expenses, setExpenses] = useState<number>(0)

  const taxYear = getTaxYearForDate()

  const result = useMemo(() => {
    const taxable = Math.max(0, income - expenses)
    const estimate = computeIncomeTax(taxable)
    const mtd = assessMtdLiability(income)
    return { taxable, estimate, mtd }
  }, [income, expenses])

  const handleIncomeChange = (value: number) => {
    setIncome(Math.max(0, value || 0))
  }

  const handleExpensesChange = (value: number) => {
    setExpenses(Math.max(0, value || 0))
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">What-if Estimator</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Drag the sliders to forecast your tax for {taxYear.label}. Adjust
        income and deductible expenses to see how your tax bill changes — and
        whether you need Making Tax Digital.
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between text-sm">
            <label htmlFor="est-income" className="font-medium">
              Annual income
            </label>
            <span className="font-bold">{formatPounds(income)}</span>
          </div>
          <input
            id="est-income"
            type="range"
            min={0}
            max={200000}
            step={500}
            value={income}
            onChange={(e) => handleIncomeChange(Number(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
          <input
            type="number"
            min={0}
            step={500}
            value={income}
            onChange={(e) => handleIncomeChange(Number(e.target.value))}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-sm">
            <label htmlFor="est-expenses" className="font-medium">
              Deductible expenses
            </label>
            <span className="font-bold">{formatPounds(expenses)}</span>
          </div>
          <input
            id="est-expenses"
            type="range"
            min={0}
            max={100000}
            step={100}
            value={expenses}
            onChange={(e) => handleExpensesChange(Number(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
          <input
            type="number"
            min={0}
            step={100}
            value={expenses}
            onChange={(e) => handleExpensesChange(Number(e.target.value))}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Taxable income
          </p>
          <p className="mt-1 text-lg font-bold">
            {formatPounds(result.taxable)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Estimated income tax
          </p>
          <p className="mt-1 text-lg font-bold">
            {formatPounds(result.estimate.totalTax)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Effective rate
          </p>
          <p className="mt-1 text-lg font-bold">
            {(result.estimate.effectiveRate * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {result.estimate.rows.map((row: TaxBandRow) => (
              <tr key={row.band.label}>
                <td className="px-4 py-2">{row.band.label}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {row.band.to
                    ? `${formatPounds(row.band.from)} – ${formatPounds(row.band.to)}`
                    : `${formatPounds(row.band.from)}+`}
                </td>
                <td className="px-4 py-2 text-right">
                  {formatPounds(row.tax)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-border bg-muted/50">
              <td className="px-4 py-2 font-semibold">Total</td>
              <td className="px-4 py-2 text-right text-muted-foreground">
                On {formatPounds(result.taxable)}
              </td>
              <td className="px-4 py-2 text-right font-semibold">
                {formatPounds(result.estimate.totalTax)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {result.mtd.liable && result.mtd.stage ? (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          <Calculator className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            At {formatPounds(income)} income you&apos;re within MTD&apos;s{" "}
            {result.mtd.stage.mtdStart} requirement — HMRC would require digital
            tax returns from this date.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <Calculator className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Below the current MTD threshold. If income passes{" "}
            {formatPounds(result.mtd.nextStage?.threshold ?? 0)}, MTD applies
            from {result.mtd.nextStage?.mtdStart ?? "a future date"}.
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Estimates use {taxYear.label} bands (personal allowance £12,570, tapered
        above £100,000). Your real liability also depends on allowances, other
        income, and HMRC rules — confirm with an accountant.
      </p>
    </section>
  )
}