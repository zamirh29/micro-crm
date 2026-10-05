"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  FolderOpen,
  Files,
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

const ACCEPT = ".xlsx,.xlsm,.csv"
const MAX_FILES = 200
const COMMIT_CHUNK = 1500

// The hosting platform rejects any single request body over roughly 4MB with an
// opaque 413, long before the server sees it. Measured in production: 4MB
// reached the app, 4.4MB did not. Stay under that ceiling ourselves so a big
// folder is split across several requests instead of failing outright.
const MAX_REQUEST_BYTES = 3.5 * 1024 * 1024

// One file can still be too big to fit in any request, so it is refused up front
// with a reason the user can act on.
const MAX_FILE_BYTES = MAX_REQUEST_BYTES

/** Split files into request-sized groups, never splitting a single file. */
function batchBySize(files: File[]): File[][] {
  const batches: File[][] = []
  let current: File[] = []
  let currentBytes = 0

  for (const file of files) {
    if (current.length > 0 && currentBytes + file.size > MAX_REQUEST_BYTES) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(file)
    currentBytes += file.size
  }

  if (current.length > 0) batches.push(current)
  return batches
}

interface RejectedFile {
  fileName: string
  reason: string
}

interface SheetState {
  id: number
  fileName: string
  headers: string[]
  grid: string[][]
  map: ColumnMap
  drafts: ImportDraft[]
  truncated: boolean
}

interface ParsedSheetResponse extends Omit<SheetState, "map"> {
  autoDetected: ColumnMap
}

interface CommitOutcome {
  created: number
  skipped: number
  createdContacts: number
  createdInvoices: number
  createdQuotes: number
  errors: {
    rowNumber: number
    originalNumber: string
    sourceFile?: string
    reason: string
  }[]
}

interface DroppedEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (onFile: (f: File) => void, onError?: (e: unknown) => void) => void
  createReader?: () => {
    readEntries: (
      onEntries: (entries: DroppedEntry[]) => void,
      onError?: (e: unknown) => void
    ) => void
  }
}

function signature(headers: string[]): string {
  return headers.map((h) => h.trim().toLowerCase()).join("")
}

function accepted(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || lower.endsWith(".csv")
}

function readEntryFile(entry: DroppedEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file?.(resolve, () => reject(new Error(`Could not read ${entry.name}`)))
  })
}

function readBatch(reader: {
  readEntries: (
    onEntries: (entries: DroppedEntry[]) => void,
    onError?: (e: unknown) => void
  ) => void
}): Promise<DroppedEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, () => reject(new Error("Could not read folder")))
  })
}

async function walk(entry: DroppedEntry, prefix: string, out: File[]) {
  if (entry.isFile) {
    try {
      const file = await readEntryFile(entry)
      // Re-wrap with the folder path so two files that share a name in
      // different years stay distinguishable in previews and error reports.
      const name = `${prefix}${file.name}`.slice(0, 240)
      out.push(name === file.name ? file : new File([file], name, { type: file.type }))
    } catch {
      return
    }
    return
  }

  if (!entry.isDirectory || !entry.createReader) return

  const reader = entry.createReader()
  const nextPrefix = `${prefix}${entry.name}/`

  // readEntries returns at most 100 entries per call, so it has to be drained
  // until it hands back an empty batch.
  for (;;) {
    const batch = await readBatch(reader)
    if (batch.length === 0) break
    for (const child of batch) await walk(child, nextPrefix, out)
  }
}

async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const items = Array.from(transfer.items ?? [])
  const entries = items
    .map((item) =>
      typeof (item as DataTransferItem).webkitGetAsEntry === "function"
        ? ((item as DataTransferItem & { webkitGetAsEntry?: () => DroppedEntry | null })
            .webkitGetAsEntry as () => DroppedEntry | null)()
        : null
    )
    .filter((entry): entry is DroppedEntry => entry !== null)

  if (entries.length === 0) return Array.from(transfer.files ?? [])

  const out: File[] = []
  for (const entry of entries) await walk(entry, "", out)
  return out
}

export default function ImportWizard({ orgCurrency }: { orgCurrency: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  // Without this, dropping a file slightly off the dropzone makes the browser
  // navigate to it, discarding the whole page and any review already done.
  // Swallowing file drags document-wide keeps the dropzone as the only place a
  // drop has meaning, without stopping the event reaching it.
  useEffect(() => {
    const swallowFileDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) event.preventDefault()
    }

    document.addEventListener("dragover", swallowFileDrop)
    document.addEventListener("drop", swallowFileDrop)
    return () => {
      document.removeEventListener("dragover", swallowFileDrop)
      document.removeEventListener("drop", swallowFileDrop)
    }
  }, [])

  const [kind, setKind] = useState<ImportKind>("invoice")
  const [inPence, setInPence] = useState(false)
  const [taxRate, setTaxRate] = useState(20)
  const [sheets, setSheets] = useState<SheetState[]>([])
  const [rejected, setRejected] = useState<RejectedFile[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<CommitOutcome | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const groups = useMemo(() => {
    const bySignature = new Map<string, SheetState[]>()
    for (const sheet of sheets) {
      const key = signature(sheet.headers)
      const existing = bySignature.get(key)
      if (existing) existing.push(sheet)
      else bySignature.set(key, [sheet])
    }
    return Array.from(bySignature.values())
  }, [sheets])

  const allDrafts = useMemo(() => sheets.flatMap((sheet) => sheet.drafts), [sheets])
  const ready = useMemo(() => allDrafts.filter((d) => !d.error).length, [allDrafts])
  const blocked = useMemo(() => allDrafts.filter((d) => d.error).length, [allDrafts])
  const duplicateRefs = useMemo(() => {
    const seen = new Map<string, ImportDraft[]>()
    for (const draft of allDrafts) {
      const key = draft.originalNumber.trim().toLowerCase()
      if (!key) continue
      const list = seen.get(key)
      if (list) list.push(draft)
      else seen.set(key, [draft])
    }
    return Array.from(seen.entries()).filter(([, list]) => list.length > 1)
  }, [allDrafts])

  // Only a repeat that also agrees on date and total is treated as the same
  // document twice; matching the commit-side rule so the preview never
  // promises more than the import will actually create.
  const exactRepeats = useMemo(
    () =>
      duplicateRefs.filter(([, list]) => {
        const shapes = list.map((draft) => {
          const subtotal = draft.items.reduce(
            (sum, item) => sum + Math.round(item.unitPrice) * Math.max(1, Math.round(item.quantity)),
            0
          )
          return `${draft.documentDate ?? ""}|${subtotal + Math.round((subtotal * taxRate) / 100)}`
        })
        return new Set(shapes).size < shapes.length
      }),
    [duplicateRefs, taxRate]
  )

  const totals = useMemo(
    () =>
      allDrafts.reduce(
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
      ),
    [allDrafts, taxRate]
  )

  const uploadFiles = useCallback(
    async (incoming: File[], forKind: ImportKind, pence: boolean) => {
      const supported = incoming.filter((file) => accepted(file.name))
      const ignored: RejectedFile[] = incoming
        .filter((file) => !accepted(file.name))
        .map((file) => ({ fileName: file.name, reason: "Not an .xlsx or .csv file" }))

      // Reported rather than dropped silently: a file this big can never fit in
      // one request, so it needs splitting by the user.
      const oversized = supported.filter((file) => file.size > MAX_FILE_BYTES)
      for (const file of oversized) {
        ignored.push({
          fileName: file.name,
          reason: `Too large (${(file.size / 1024 / 1024).toFixed(1)}MB) — split it into smaller files`,
        })
      }
      const usable = supported.filter((file) => file.size <= MAX_FILE_BYTES)

      if (usable.length === 0) {
        setError(
          oversized.length > 0
            ? "Those files are too large to upload. Split them into smaller spreadsheets and try again."
            : "None of those files are .xlsx or .csv files"
        )
        setRejected(ignored)
        return
      }

      setBusy(true)
      setError(null)
      setProgress(`Reading ${usable.length} file${usable.length === 1 ? "" : "s"}…`)

      try {
        const batches = batchBySize(usable)
        const allSheets: ParsedSheetResponse[] = []
        const allRejected: RejectedFile[] = [...ignored]
        let nextId = 0

        for (const [batchIndex, batch] of batches.entries()) {
          if (batches.length > 1) {
            setProgress(
              `Reading files ${batchIndex + 1} of ${batches.length}…`
            )
          }

          const form = new FormData()
          for (const file of batch) form.append("files", file)
          form.append("kind", forKind)
          form.append("inPence", String(pence))

          const res = await fetch("/api/import/parse", { method: "POST", body: form })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? "Could not read those files")

          // The server ids only need to be unique within one response, so they
          // have to be re-based once several responses are merged.
          for (const sheet of (data.sheets ?? []) as ParsedSheetResponse[]) {
            allSheets.push({ ...sheet, id: nextId++ })
          }
          allRejected.push(...((data.rejected ?? []) as RejectedFile[]))
        }

        setSheets(
          allSheets.map((sheet) => ({
            ...sheet,
            map: sheet.autoDetected ?? {},
          }))
        )
        setRejected(allRejected)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read those files")
      } finally {
        setBusy(false)
        setProgress(null)
      }
    },
    []
  )

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (busy) return

    let picked: File[]
    try {
      picked = await filesFromDrop(event.dataTransfer)
    } catch {
      setError("Could not read that selection. Try picking the folder instead.")
      return
    }

    if (picked.length === 0) {
      setError("No files found in that drop")
      return
    }
    if (picked.length > MAX_FILES) {
      setError(`That folder holds more than ${MAX_FILES} files. Select a subset.`)
      return
    }

    await uploadFiles(picked, kind, inPence)
  }

  async function reparseGroup(group: SheetState[], nextMap: ColumnMap) {
    setBusy(true)
    setError(null)

    for (const sheet of group) {
      try {
        const res = await fetch("/api/import/parse", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind,
            map: nextMap,
            inPence,
            sourceFile: sheet.fileName,
            grid: sheet.grid,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Could not re-read the file")

        const drafts = (data.drafts ?? []) as ImportDraft[]
        setSheets((prev) =>
          prev.map((s) => (s.id === sheet.id ? { ...s, map: nextMap, drafts } : s))
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not re-read the file")
        break
      }
    }

    setBusy(false)
  }

  async function commit() {
    if (ready === 0) return

    setBusy(true)
    setError(null)

    const rows = allDrafts
      .filter((draft) => !draft.error)
      .map((draft) => ({
        rowNumber: draft.rowNumber,
        sourceFile: draft.sourceFile,
        originalNumber: draft.originalNumber,
        customerName: draft.customerName,
        customerEmail: draft.customerEmail,
        customerCompany: draft.customerCompany,
        title: draft.title,
        documentDate: draft.documentDate,
        sentDate: draft.sentDate,
        dueDate: draft.dueDate,
        paidDate: draft.paidDate,
        acceptedDate: draft.acceptedDate,
        validUntil: draft.validUntil,
        status: draft.status,
        notes: draft.notes,
        currency: draft.currency || orgCurrency,
        items: draft.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      }))

    const chunks: typeof rows[] = []
    for (let i = 0; i < rows.length; i += COMMIT_CHUNK) {
      chunks.push(rows.slice(i, i + COMMIT_CHUNK))
    }

    const total: CommitOutcome = {
      created: 0,
      skipped: 0,
      createdContacts: 0,
      createdInvoices: 0,
      createdQuotes: 0,
      errors: [],
    }

    try {
      for (const [index, chunk] of chunks.entries()) {
        setProgress(
          chunks.length > 1
            ? `Importing batch ${index + 1} of ${chunks.length}…`
            : `Importing ${rows.length} documents…`
        )

        const res = await fetch("/api/import/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, taxRate, rows: chunk }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Import failed")

        const part = data as CommitOutcome
        total.created += part.created ?? 0
        total.skipped += part.skipped ?? 0
        total.createdContacts += part.createdContacts ?? 0
        total.createdInvoices += part.createdInvoices ?? 0
        total.createdQuotes += part.createdQuotes ?? 0
        total.errors.push(...(part.errors ?? []))
      }

      setOutcome(total)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed")
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function reset() {
    setSheets([])
    setRejected([])
    setOutcome(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ""
    if (folderRef.current) folderRef.current.value = ""
  }

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
                  {outcome.skipped} document{outcome.skipped === 1 ? "" : "s"} could
                  not be imported.
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
                  Import more files
                </button>
              </div>
            </div>
          </div>
        </div>

        {outcome.errors.length > 0 && (
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <h3 className="font-semibold">Documents that could not be imported</h3>
            </div>
            <ul className="divide-y divide-border text-sm">
              {outcome.errors.slice(0, 100).map((err, i) => (
                <li key={i} className="flex items-start justify-between gap-4 p-4">
                  <span className="font-medium">
                    {err.originalNumber || "No number"}
                    {err.rowNumber > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        row {err.rowNumber}
                        {err.sourceFile ? ` of ${err.sourceFile}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="text-right text-muted-foreground">{err.reason}</span>
                </li>
              ))}
            </ul>
            {outcome.errors.length > 100 && (
              <p className="border-t border-border p-4 text-sm text-muted-foreground">
                Showing the first 100 of {outcome.errors.length}.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  if (sheets.length === 0) {
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
            One or many .xlsx or .csv files, one row per line item, with your own
            invoice or quote number repeated on each line. Drag a whole folder in to
            read several years at once. Nothing is created until you review it on the
            next step.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!busy) setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`mt-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              Drop {`${ACCEPT.replace(/,/g, " or ")}`} files here, or a folder
            </p>

            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              data-import-input="files"
              className="sr-only"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                if (files.length > 0) uploadFiles(files, kind, inPence)
              }}
            />
            <input
              ref={folderRef}
              type="file"
              accept={ACCEPT}
              multiple
              data-import-input="folder"
              className="sr-only"
              {...{ webkitdirectory: "", directory: "" }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                if (files.length > 0) uploadFiles(files, kind, inPence)
              }}
            />

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Choose files
              </button>
              <button
                type="button"
                onClick={() => folderRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <FolderOpen className="h-4 w-4" />
                Choose a folder
              </button>
            </div>

            {progress && (
              <p className="mt-4 text-sm text-muted-foreground">{progress}</p>
            )}
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

  const showFileColumn = sheets.length > 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">3. Review before importing</h2>
          <p className="text-sm text-muted-foreground">
            {sheets.length} file{sheets.length === 1 ? "" : "s"} — {ready}{" "}
            {kind}
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="font-semibold">Files</h3>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Files className="h-4 w-4" />
            {sheets.length} loaded
          </span>
        </div>
        <ul className="mt-3 divide-y divide-border text-sm">
          {sheets.map((sheet) => {
            const sheetReady = sheet.drafts.filter((d) => !d.error).length
            return (
              <li
                key={sheet.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{sheet.fileName}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {sheetReady} ready
                  {sheet.drafts.length - sheetReady > 0 &&
                    `, ${sheet.drafts.length - sheetReady} skipped`}
                  {sheet.truncated && (
                    <span className="ml-2 text-amber-700 dark:text-amber-400">
                      truncated at 10,000 rows
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>

        {rejected.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <p className="font-medium">
              {rejected.length} file{rejected.length === 1 ? "" : "s"} could not be read
            </p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {rejected.map((item) => (
                <li key={item.fileName} className="truncate">
                  {item.fileName} — {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {groups.map((group, groupIndex) => {
        const map = group[0].map
        return (
          <div
            key={groupIndex}
            className="rounded-lg border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="font-semibold">Column mapping</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              We matched these automatically. Change anything that looks wrong and the
              preview updates.
            </p>
            {group.length > 1 && (
              <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {group.length} files share this column layout and are mapped together:{" "}
                {group.map((sheet) => sheet.fileName).join(", ")}
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELD_OPTIONS.map((option) => (
                <div key={option.key}>
                  <label
                    className="text-sm font-medium"
                    htmlFor={`map-${groupIndex}-${option.key}`}
                  >
                    {option.label}
                  </label>
                  <select
                    id={`map-${groupIndex}-${option.key}`}
                    value={map[option.key] ?? -1}
                    onChange={(e) => {
                      const value = e.target.value
                      const next: ColumnMap = { ...map }
                      if (value === "-1") delete next[option.key]
                      else next[option.key] = Number(value)
                      reparseGroup(group, next)
                    }}
                    disabled={busy}
                    className="mt-1 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm disabled:opacity-50"
                  >
                    <option value={-1}>Not in this file</option>
                    {group[0].headers.map((header, index) => (
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
        )
      })}

      {duplicateRefs.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-medium">
            {duplicateRefs.length} original number
            {duplicateRefs.length === 1 ? " is" : "s are"} used by more than one
            document
          </p>
          <p className="mt-1 text-muted-foreground">
            {exactRepeats.length > 0 ? (
              <>
                {exactRepeats.length} of them repeat with the same date and total, which
                usually means a file was added twice — those will be skipped. Any that
                differ are treated as genuinely different documents and will be
                imported separately.
              </>
            ) : (
              <>
                All of them differ in date or amount, so they look like real separate
                documents and will be imported separately.
              </>
            )}{" "}
            Numbers already in MicroCRM are always skipped.
          </p>
          <p className="mt-2 truncate text-xs text-muted-foreground">
            {duplicateRefs.slice(0, 20).map(([ref]) => ref).join(", ")}
            {duplicateRefs.length > 20 && ` +${duplicateRefs.length - 20} more`}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/95 backdrop-blur">
              <tr className="border-b border-border">
                {showFileColumn && (
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    File
                  </th>
                )}
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
              {allDrafts.map((draft) => {
                const lineTotal = draft.items.reduce(
                  (sum, item) => sum + Math.round(item.unitPrice * item.quantity),
                  0
                )
                const withTax = lineTotal + Math.round((lineTotal * taxRate) / 100)
                return (
                  <tr
                    key={`${draft.sourceFile}-${draft.rowNumber}`}
                    className={`border-b border-border last:border-0 ${
                      draft.error ? "bg-red-50/60 dark:bg-red-950/30" : ""
                    }`}
                  >
                    {showFileColumn && (
                      <td className="max-w-[12rem] truncate px-3 py-2 text-xs text-muted-foreground">
                        {draft.sourceFile}
                      </td>
                    )}
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
                      {kind === "invoice" ? draft.dueDate ?? "—" : draft.acceptedDate ?? "—"}
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
            ({((totals.subtotal + totals.tax) / 100).toFixed(2)} including VAT)
          </p>
          {blocked > 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {blocked} row{blocked === 1 ? "" : "s"} will be skipped because they
              have no date or no line items.
            </p>
          )}
          {progress && <p className="mt-1 text-xs text-muted-foreground">{progress}</p>}
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