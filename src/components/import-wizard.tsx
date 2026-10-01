"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Upload,
  Loader2,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Check,
} from "lucide-react"
import {
  type ImportField,
  type ImportKind,
  type ImportDraft,
  type ColumnMap,
} from "@/lib/import/parse"

interface FieldOption {
  key: ImportField
  label: string
  hint: string
}

const FIELD_OPTIONS: FieldOption[] = [
  { key: "documentDate", label: "Invoice / quote date", hint: "Required — orders the import" },
  { key: "originalNumber", label: "Original number", hint: "Kept as a reference, not used as our number" },
  { key: "customerName", label: "Customer name", hint: "Matched against existing customers" },
  { key: "customerEmail", label: "Customer email", hint: "Preferred way to match a customer" },
  { key: "customerCompany", label: "Customer company", hint: "Fallback match / creates a contact" },
  { key: "title", label: "Title", hint: "Document title" },
  { key: "sentDate", label: "Sent date", hint: "Defaults to the invoice date" },
  { key: "dueDate", label: "Due date", hint: "Defaults to 30 days after the invoice date" },
  { key: "paidDate", label: "Paid date", hint: "Presence marks the invoice as paid" },
  { key: "acceptedDate", label: "Accepted date", hint: "Quotes only" },
  { key: "validUntil", label: "Valid until", hint: "Quotes only" },
  { key: "status", label: "Status", hint: "Mapped to draft/sent/paid or quote statuses" },
  { key: "itemDescription", label: "Line description", hint: "One row per line item" },
  { key: "quantity", label: "Quantity", hint: "Defaults to 1" },
  { key: "unitPrice", label: "Unit price", hint: "Excluding VAT" },
  { key: "taxRate", label: "Tax rate column", hint: "Ignored — VAT is set once for the whole import" },
  { key: "notes", label: "Notes", hint: "Applied to every line" },
  { key: "currency", label: "Currency", hint: "Defaults to GBP" },
]

interface CommitOutcome {
  created: number
  skipped: number
  createdContacts: number
  createdInvoices: number
  createdQuotes: number
  errors: { rowNumber: number; originalNumber: string; reason: string }[]
}

export default function ImportWizard({ orgCurrency }: { orgCurrency: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState<ImportKind>("invoice")
  const [inPence, setInPence] = useState(false)
  const [taxRate, setTaxRate] = useState(20)
  const [headers, setHeaders] = useState<string[]>([])
  const [drafts, setDrafts] = useState<ImportDraft[]>([])
  const [map, setMap] = useState<ColumnMap>({})
  const [grid, setGrid] = useState<string[][]>([])
  const [fileName, setFileName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<CommitOutcome | null>(null)

  const uploadFile = useCallback(
    async (file: File, forKind: ImportKind, pence: boolean) => {
      setBusy(true)
      setError(null)
      try {
        const form = new FormData()
        form.append("file", file)
        form.append("kind", forKind)
        form.append("inPence", String(pence))

        const res = await fetch("/api/import/parse", { method: "POST", body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Could not read that file")

        setHeaders(data.headers ?? [])
        setDrafts(data.drafts ?? [])
        setMap(data.autoDetected ?? {})
        setGrid(data.grid ?? [])
        setFileName(file.name)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read that file")
      } finally {
        setBusy(false)
      }
    },
    []
  )

  async function reparse(nextMap: ColumnMap) {
    if (grid.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/import/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, map: nextMap, inPence, grid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Could not re-read the file")

      setHeaders(data.headers ?? headers)
      setDrafts(data.drafts ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not re-read the file")
    } finally {
      setBusy(false)
    }
  }

  const ready = useMemo(() => drafts.filter((d) => !d.error).length, [drafts])
  const blocked = useMemo(() => drafts.filter((d) => d.error).length, [drafts])

  const totals = useMemo(() => {
    return drafts.reduce(
      (acc, draft) => {
        if (draft.error) return acc
        const lineTotal = draft.items.reduce(
          (sum, item) => sum + Math.round(item.unitPrice * item.quantity),
          0
        )
        acc.subtotal += lineTotal
        acc.tax += Math.round((lineTotal * taxRate) / 100)
        return acc
      },
      { subtotal: 0, tax: 0 }
    )
  }, [drafts, taxRate])

  async function commit() {
    const usable = drafts.filter((d) => !d.error)
    if (usable.length === 0) return

    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          taxRate,
          rows: usable.map((d) => ({
            rowNumber: d.rowNumber,
            originalNumber: d.originalNumber,
            customerName: d.customerName,
            customerEmail: d.customerEmail,
            customerCompany: d.customerCompany,
            title: d.title,
            documentDate: d.documentDate,
            sentDate: d.sentDate,
            dueDate: d.dueDate,
            paidDate: d.paidDate,
            acceptedDate: d.acceptedDate,
            validUntil: d.validUntil,
            status: d.status,
            notes: d.notes,
            currency: d.currency || orgCurrency,
            items: d.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Import failed")

      setOutcome(data)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed")
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setDrafts([])
    setHeaders([])
    setGrid([])
    setFileName("")
    setOutcome(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  // ---- result -----------------------------------------------------------
  if (outcome) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-950 dark:bg-green-950/40">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            <div>
              <h2 className="font-semibold">Import complete</h2>
              <p className="mt-1 text-sm">
                Created {outcome.created}{" "}
                {kind === "invoice" ? "invoices" : "quotes"}
                {outcome.createdContacts > 0 &&
                  ` and ${outcome.createdContacts} new customer${
                    outcome.createdContacts === 1 ? "" : "s"
                  }`}
                , numbered oldest first.
              </p>
              {outcome.skipped > 0 && (
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  {outcome.skipped} row{outcome.skipped === 1 ? "" : "s"} could not
                  be imported.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={kind === "invoice" ? "/dashboard/invoices" : "/dashboard/quotes"}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  View {kind === "invoice" ? "invoices" : "quotes"}
                </Link>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Import another file
                </button>
              </div>
            </div>
          </div>
        </div>

        {outcome.errors.length > 0 && (
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h3 className="font-semibold">Rows that could not be imported</h3>
            </div>
            <ul className="divide-y divide-border text-sm">
              {outcome.errors.slice(0, 50).map((err, i) => (
                <li key={i} className="flex items-center justify-between gap-4 p-4">
                  <span className="font-medium">
                    {err.originalNumber || "No number"}
                    {err.rowNumber > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        row {err.rowNumber}
                      </span>
                    )}
                  </span>
                  <span className="text-right text-muted-foreground">{err.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // ---- step 1: upload ---------------------------------------------------
  if (drafts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">1. Choose what you are importing</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["invoice", "quote"] as ImportKind[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  kind === option
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted"
                }`}
              >
                <p className="font-medium capitalize">{option}s</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {option === "invoice"
                    ? "Bring in invoices you have already issued, with invoice, sent, due and paid dates."
                    : "Bring in quotes you have already sent, with quote, sent and accepted dates."}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">2. Upload your spreadsheet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            An .xlsx or .csv file, one row per line item, with your own invoice or
            quote number repeated on each line. Nothing is created until you review
            it on the next step.
          </p>

          <div className="mt-4 rounded-lg border-2 border-dashed border-border p-8 text-center">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm,.csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadFile(file, kind, inPence)
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Choose file
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={inPence}
                onChange={(e) => setInPence(e.target.checked)}
                className="mt-1"
              />
              <span>
                My amounts are already in pence
                <span className="block text-xs text-muted-foreground">
                  Leave unticked if the sheet shows pounds, e.g. 120.50 for £120.50.
                  Checking this halves values that are in pounds, so please check your
                  sheet first.
                </span>
              </span>
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ---- step 2: review ---------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">3. Review before importing</h2>
          <p className="text-sm text-muted-foreground">
            {fileName} — {ready} {kind}
            {ready === 1 ? "" : "s"} ready
            {blocked > 0 && `, ${blocked} skipped`}. Numbers are generated fresh and
            assigned in date order.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Start over
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h3 className="font-semibold">Column mapping</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We matched these automatically. Change anything that looks wrong and the
          preview updates.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELD_OPTIONS.map((option) => (
            <div key={option.key}>
              <label className="text-sm font-medium" htmlFor={`map-${option.key}`}>
                {option.label}
              </label>
              <select
                id={`map-${option.key}`}
                value={map[option.key] ?? -1}
                onChange={(e) => {
                  const value = e.target.value
                  const next: ColumnMap = { ...map }
                  if (value === "-1") delete next[option.key]
                  else next[option.key] = Number(value)
                  setMap(next)
                  reparse(next)
                }}
                className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
              >
                <option value={-1}>Not in this file</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header || `Column ${index + 1}`}
                  </option>
                ))}
              </select>
              <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 max-w-xs">
          <label className="text-sm font-medium" htmlFor="tax-rate">
            VAT rate for the whole import
          </label>
          <input
            id="tax-rate"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
          />
          <p className="mt-0.5 text-xs text-muted-foreground">
            Applied to every line. Check this matches your historical VAT.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Original no.
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Customer
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  {kind === "invoice" ? "Invoice date" : "Quote date"}
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Sent
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  {kind === "invoice" ? "Due" : "Accepted"}
                </th>
                {kind === "invoice" && (
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Paid
                  </th>
                )}
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Lines
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Total
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => {
                const lineTotal = draft.items.reduce(
                  (sum, item) => sum + Math.round(item.unitPrice * item.quantity),
                  0
                )
                const withTax = lineTotal + Math.round((lineTotal * taxRate) / 100)
                return (
                  <tr
                    key={draft.rowNumber}
                    className={`border-b border-border last:border-0 ${
                      draft.error ? "bg-red-50/60 dark:bg-red-950/30" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">
                      {draft.originalNumber || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {draft.customerName || draft.customerCompany || "—"}
                      {draft.customerEmail && (
                        <span className="block text-xs text-muted-foreground">
                          {draft.customerEmail}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{draft.documentDate ?? "—"}</td>
                    <td className="px-3 py-2">{draft.sentDate ?? "—"}</td>
                    <td className="px-3 py-2">
                      {kind === "invoice"
                        ? draft.dueDate ?? "—"
                        : draft.acceptedDate ?? "—"}
                    </td>
                    {kind === "invoice" && (
                      <td className="px-3 py-2">{draft.paidDate ?? "—"}</td>
                    )}
                    <td className="px-3 py-2 capitalize">{draft.status ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{draft.items.length}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: draft.currency || orgCurrency,
                      }).format(withTax / 100)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {draft.error ? (
                        <span className="flex items-start gap-1 text-red-700 dark:text-red-400">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          {draft.error}
                        </span>
                      ) : (
                        draft.warnings.map((warning, i) => (
                          <span key={i} className="flex items-start gap-1">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            {warning}
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="text-sm">
          <p>
            <span className="font-medium">{ready}</span>{" "}
            {kind === "invoice" ? "invoices" : "quotes"} totalling{" "}
            <span className="font-medium">
              {new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: orgCurrency,
              }).format((totals.subtotal + totals.tax) / 100)}
            </span>{" "}
            ({(totals.subtotal + totals.tax / 100).toFixed(2)} including VAT)
          </p>
          {blocked > 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {blocked} row{blocked === 1 ? "" : "s"} will be skipped because they
              have no date or no line items.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={commit}
          disabled={busy || ready === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Import {ready} {kind === "invoice" ? "invoices" : "quotes"}
        </button>
      </div>
    </div>
  )
}