import Link from "next/link"
import { ArrowRight, FileSpreadsheet, Info, Landmark } from "lucide-react"
import { getTaxYearForDate } from "@/lib/uk-tax"
import {
  EXPORT_DATASETS,
  EXPORT_FORMATS,
} from "@/lib/exports/accounting"

export const dynamic = "force-dynamic"

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default function AccountingExportsPage() {
  const taxYear = getTaxYearForDate()
  const defaultFrom = isoDate(taxYear.start)
  const defaultTo = isoDate(new Date())

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          Accounting exports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download your sales, purchases or a VAT summary as a CSV that can be
          imported into Xero, QuickBooks, Sage or a spreadsheet. Every amount is
          taken from the records already in MicroCRM.
        </p>
      </div>

      <form
        action="/api/exports/accounting"
        method="get"
        className="rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="format"
              className="block text-sm font-medium text-foreground"
            >
              Accounting software
            </label>
            <select
              id="format"
              name="format"
              defaultValue="generic"
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {EXPORT_FORMATS.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label} — {format.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="dataset"
              className="block text-sm font-medium text-foreground"
            >
              What to export
            </label>
            <select
              id="dataset"
              name="dataset"
              defaultValue="sales"
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {EXPORT_DATASETS.map((dataset) => (
                <option key={dataset.value} value={dataset.value}>
                  {dataset.label} — {dataset.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="from"
              className="block text-sm font-medium text-foreground"
            >
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={defaultFrom}
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="to"
              className="block text-sm font-medium text-foreground"
            >
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={defaultTo}
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Download CSV
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">What each export contains</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Sales</span> — one
              row per invoice: customer, dates, net, VAT rate, VAT and gross.
            </li>
            <li>
              <span className="font-medium text-foreground">Purchases</span> —
              one row per expense: date, category, description and amount.
            </li>
            <li>
              <span className="font-medium text-foreground">VAT summary</span> —
              boxes 1–9 for the chosen period, ready to copy into a return.
            </li>
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Import tips</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              Xero: Business → Invoices → Import. QuickBooks: Sales → Customers
              → Import data.
            </li>
            <li>
              Sage 50: File → Import → Audit Trail. Check your nominal codes
              before importing.
            </li>
            <li>
              Import into a sandbox or test company first — accounting packages
              treat duplicate invoice numbers strictly.
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm dark:border-amber-900 dark:bg-amber-950">
        <p className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
          <Info className="h-4 w-4" />
          VAT and expenses
        </p>
        <p className="mt-1 text-amber-800 dark:text-amber-300">
          Expenses are recorded gross in MicroCRM with no VAT split, so they are
          exported as non-reclaimable purchases. If you are VAT registered,
          check the summary with your accountant before filing.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="h-4 w-4 text-primary" />
            Making Tax Digital
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your HMRC account to see VAT obligations and submit returns
            directly.
          </p>
        </div>
        <Link
          href="/dashboard/integrations/hmrc"
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Open HMRC settings
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
