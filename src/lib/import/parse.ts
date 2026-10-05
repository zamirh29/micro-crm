/**
 * Historical document import parsing.
 *
 * Turns an uploaded spreadsheet (XLSX or CSV) into normalised import rows.
 * Nothing here writes to the database: parsing is deliberately separate from
 * creation so the user can review and correct every row before committing.
 *
 * Expected shape: one row per line item, with the document's own number
 * repeated on each line. This matches what accounting packages export and is
 * the shape a single-line-item invoice naturally collapses to.
 */

export type ImportKind = "invoice" | "quote"

/** Canonical fields we try to auto-detect from the spreadsheet headers. */
export const IMPORT_FIELDS = [
  "originalNumber",
  "customerName",
  "customerEmail",
  "customerCompany",
  "title",
  "documentDate",
  "sentDate",
  "dueDate",
  "paidDate",
  "acceptedDate",
  "validUntil",
  "status",
  "itemDescription",
  "quantity",
  "unitPrice",
  "taxRate",
  "notes",
  "currency",
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]

export type ColumnMap = Partial<Record<ImportField, number>>

/**
 * Header aliases, matched case-insensitively after stripping punctuation.
 * Ordered so the more specific label wins over the generic one.
 */
const FIELD_ALIASES: Record<ImportField, string[]> = {
  originalNumber: [
    "invoice number",
    "invoice no",
    "inv number",
    "inv no",
    "quote number",
    "quote no",
    "document number",
    "document no",
    "reference",
    "reference number",
    "ref",
    "number",
    "no",
  ],
  customerName: [
    "customer name",
    "client name",
    "customer",
    "client",
    "bill to",
    "billed to",
    "name",
  ],
  customerEmail: ["customer email", "client email", "email", "e mail"],
  customerCompany: ["company", "company name", "business", "trading name"],
  title: ["title", "project", "subject", "job"],
  documentDate: [
    "invoice date",
    "date of invoice",
    "date issued",
    "issue date",
    "quote date",
    "document date",
    "date",
  ],
  sentDate: [
    "sent date",
    "date sent",
    "sent on",
    "emailed",
    "email date",
    "date emailed",
  ],
  dueDate: ["due date", "payment due", "due on", "payable by", "due"],
  paidDate: [
    "paid date",
    "date paid",
    "payment date",
    "payment received",
    "date received",
    "settled",
    "paid on",
  ],
  acceptedDate: ["accepted date", "date accepted", "accepted on", "accepted"],
  validUntil: ["valid until", "valid to", "validity", "expires", "expiry date"],
  status: ["status", "payment status", "invoice status", "quote status", "state"],
  itemDescription: [
    "description",
    "line description",
    "line item",
    "item description",
    "item",
    "details",
    "detail",
    "product",
    "service",
    "particulars",
  ],
  quantity: ["quantity", "qty", "hours", "units", "no of items"],
  unitPrice: [
    "unit price",
    "unit cost",
    "price",
    "rate",
    "cost",
    "unit",
    "price each",
  ],
  taxRate: ["tax rate", "vat rate", "tax %", "vat %", "tax", "vat"],
  notes: ["notes", "note", "comment", "comments", "remarks"],
  currency: ["currency", "curr"],
}

/** Fields that must resolve to something for a row to be importable. */
const REQUIRED_FIELDS: ImportField[] = ["documentDate"]

/** Normalise a header cell into a comparable key. */
function headerKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function matchField(header: string): ImportField | null {
  const key = headerKey(header)
  if (!key) return null

  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [ImportField, string[]][]) {
    if (aliases.some((alias) => headerKey(alias) === key)) return field
  }

  // Fall back to a contains match, but only for distinctive enough keys.
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [ImportField, string[]][]) {
    if (aliases.some((alias) => key.includes(headerKey(alias)))) return field
  }

  return null
}

/** Best-effort auto-detection of which column holds which field. */
export function autoDetectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  headers.forEach((header, index) => {
    const field = matchField(header)
    if (field && map[field] === undefined) map[field] = index
  })
  return map
}

/**
 * Identity for a header layout.
 *
 * Files exported from the same system usually share a column layout, so sheets
 * are grouped by this key and share a single column mapping. Files with a
 * different layout get their own mapping rather than being forced through
 * another's column indexes.
 */
export function headerSignature(headers: string[]): string {
  return headers.map((h) => h.trim().toLowerCase()).join("")
}

export function missingRequiredFields(map: ColumnMap): ImportField[] {
  return REQUIRED_FIELDS.filter((field) => map[field] === undefined)
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180 style CSV parsing: handles quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  // Strip a UTF-8 BOM, which Excel likes to add.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (char === "\r") {
      // handled by the \n branch
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""))
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

type CellValue = string | number | Date | null | undefined

/** Flatten whatever exceljs hands back into a plain value. */
function normaliseCell(cell: CellValue): string {
  if (cell === null || cell === undefined) return ""

  if (cell instanceof Date) return cell.toISOString()

  if (typeof cell === "number" || typeof cell === "string") return String(cell)

  // Formula / rich text / hyperlink / error results all wrap the real value.
  const wrapped = cell as { result?: unknown; richText?: { text: string }[]; text?: string }
  if (wrapped.richText) return wrapped.richText.map((r) => r.text).join("")
  if (wrapped.result !== undefined) return normaliseCell(wrapped.result as CellValue)
  if (wrapped.text) return wrapped.text

  return ""
}

/**
 * Parse an XLSX buffer into a rectangular grid of strings, using the first
 * worksheet. Header detection happens in the first row.
 */
export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error("That spreadsheet has no sheets")

  const grid: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[]
    const cells: string[] = []
    for (let i = 1; i < values.length; i++) {
      cells.push(normaliseCell(values[i] as CellValue))
    }
    if (cells.some((cell) => cell.trim() !== "")) grid.push(cells)
  })

  return grid
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * Parse a date from a spreadsheet cell into `YYYY-MM-DD`.
 *
 * Handles ISO dates, UK/US slash formats, `12 Mar 2024`, and Excel serial
 * numbers. Ambiguous slash dates default to UK day-first ordering because this
 * is a UK product; the review screen shows the resolved date so a wrong guess
 * is visible before import.
 */
export function parseDateCell(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  // Already a full ISO timestamp.
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  // Excel serial number (1900 epoch, with the Lotus leap-year bug).
  if (/^\d{5}(\.\d+)?$/.test(value)) {
    const serial = Number(value)
    if (serial > 20000 && serial < 60000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000)
      const d = new Date(ms)
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
    return null
  }

  // Numeric d/m/y with slashes, dots or dashes.
  const numeric = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (numeric) {
    const first = Number(numeric[1])
    const second = Number(numeric[2])
    let year = Number(numeric[3])
    if (year < 100) year += year < 70 ? 2000 : 1900

    let month: number
    let day: number
    if (first > 12) {
      day = first
      month = second
    } else if (second > 12) {
      month = first
      day = second
    } else {
      // Unambiguous only by convention: treat as UK day-first.
      day = first
      month = second
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`
    }
    return null
  }

  // `12 Mar 2024` / `Mar 12, 2024`
  const textual = value.match(/^(\d{1,2})[\s-]+([a-z]{3,9})[\s,]+(\d{4})$/i)
  if (textual) {
    const month = MONTH_NAMES[textual[2].toLowerCase().slice(0, 4)] ?? MONTH_NAMES[textual[2].toLowerCase().slice(0, 3)]
    if (month) return `${textual[3]}-${pad(month)}-${pad(Number(textual[1]))}`
  }

  const textualUs = value.match(/^([a-z]{3,9})[\s-]+(\d{1,2}),?[\s]+(\d{4})$/i)
  if (textualUs) {
    const month = MONTH_NAMES[textualUs[1].toLowerCase().slice(0, 4)] ?? MONTH_NAMES[textualUs[1].toLowerCase().slice(0, 3)]
    if (month) return `${textualUs[3]}-${pad(month)}-${pad(Number(textualUs[2]))}`
  }

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)

  return null
}

/**
 * Parse a money cell into minor units (pence).
 *
 * `inPence` tells us what the sheet holds: spreadsheets almost always show
 * major units (120.50 for £120.50), but some exports use pence. The caller
 * chooses this explicitly so financial values are never silently rescaled.
 */
export function parseMoneyCell(raw: string, inPence: boolean): number | null {
  const value = raw.trim()
  if (!value) return null

  // Strip currency symbols, spaces and thousands separators.
  let cleaned = value.replace(/[£$€\s]/g, "").replace(/,/g, "")
  let negative = false
  if (/^\(.*\)$/.test(cleaned)) {
    negative = true
    cleaned = cleaned.slice(1, -1)
  }
  cleaned = cleaned.replace(/^[-+]/, "")
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null

  const numeric = Number(cleaned)
  if (!Number.isFinite(numeric)) return null

  const minor = inPence ? Math.round(numeric) : Math.round(numeric * 100)
  return negative ? -minor : minor
}

export function parseNumberCell(raw: string): number | null {
  const value = raw.trim()
  if (!value) return null
  const cleaned = value.replace(/[£$€\s]/g, "").replace(/,/g, "")
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null
  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? numeric : null
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type ParsedInvoiceStatus = "draft" | "sent" | "paid" | "overdue"
export type ParsedQuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired"

export function normaliseStatus(
  raw: string,
  kind: ImportKind,
  hasPaidDate: boolean
): ParsedInvoiceStatus | ParsedQuoteStatus | null {
  const key = raw.trim().toLowerCase()

  // A recorded payment date is the strongest signal that money came in.
  if (kind === "invoice" && hasPaidDate) return "paid"

  if (!key) return null

  const invoiceMap: Record<string, ParsedInvoiceStatus> = {
    draft: "draft",
    "in draft": "draft",
    unpaid: "sent",
    pending: "sent",
    "not paid": "sent",
    open: "sent",
    "awaiting payment": "sent",
    sent: "sent",
    issued: "sent",
    paid: "paid",
    settled: "paid",
    "paid in full": "paid",
    complete: "paid",
    completed: "paid",
    overdue: "overdue",
    late: "overdue",
  }
  const quoteMap: Record<string, ParsedQuoteStatus> = {
    draft: "draft",
    "in draft": "draft",
    sent: "sent",
    issued: "sent",
    "awaiting response": "sent",
    pending: "sent",
    open: "sent",
    quoted: "sent",
    accepted: "accepted",
    approved: "accepted",
    won: "accepted",
    "signed off": "accepted",
    rejected: "rejected",
    declined: "rejected",
    lost: "rejected",
    expired: "expired",
    lapsed: "expired",
  }

  const table = kind === "invoice" ? invoiceMap : quoteMap
  return table[key] ?? null
}

// ---------------------------------------------------------------------------
// Row shaping
// ---------------------------------------------------------------------------

export interface ImportLineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface ImportDraft {
  /** Position in the original sheet, used to keep review rows stable. */
  rowNumber: number
  /** File the row came from, so errors can name it once imports span files. */
  sourceFile?: string
  originalNumber: string
  customerName: string
  customerEmail: string
  customerCompany: string
  title: string
  documentDate: string | null
  sentDate: string | null
  dueDate: string | null
  paidDate: string | null
  acceptedDate: string | null
  validUntil: string | null
  status: ParsedInvoiceStatus | ParsedQuoteStatus | null
  items: ImportLineItem[]
  notes: string
  currency: string
  /** Non-fatal problems worth showing on the review screen. */
  warnings: string[]
  /** Set when the row cannot be imported at all. */
  error: string | null
}

export interface ParseOptions {
  kind: ImportKind
  map: ColumnMap
  /** Whether money columns are already in pence. */
  inPence: boolean
  defaultCurrency?: string
  /** Originating file name, carried onto each draft for multi-file imports. */
  sourceFile?: string
}

const cellAt = (row: string[], index: number | undefined): string =>
  index === undefined ? "" : (row[index] ?? "").trim()

/**
 * Group sheet rows into import drafts.
 *
 * Rows sharing an original document number are collapsed into one document
 * with several line items. Rows without a document number each become their own
 * single-item document.
 *
 * Grouping is deliberately scoped to the grid passed in, never across grids.
 * When a directory of spreadsheets is imported, each file is drafted on its own
 * so a repeated number like `INV-001` in two different years stays two
 * documents instead of silently merging their line items into one.
 */
export function buildDrafts(
  grid: string[][],
  options: ParseOptions
): { drafts: ImportDraft[]; headers: string[] } {
  const [headerRow, ...bodyRows] = grid
  const headers = (headerRow ?? []).map((h) => h.trim())
  const { map, kind, inPence } = options

  const drafts: ImportDraft[] = []
  const byNumber = new Map<string, ImportDraft>()

  bodyRows.forEach((row, index) => {
    const rowNumber = index + 2 // 1-based, and row 1 is the header
    if (row.every((cell) => !cell || cell.trim() === "")) return

    const documentDate = parseDateCell(cellAt(row, map.documentDate))
    const sentDate = parseDateCell(cellAt(row, map.sentDate))
    const dueDate = parseDateCell(cellAt(row, map.dueDate))
    const paidDate = parseDateCell(cellAt(row, map.paidDate))
    const acceptedDate = parseDateCell(cellAt(row, map.acceptedDate))
    const validUntil = parseDateCell(cellAt(row, map.validUntil))
    const originalNumber = cellAt(row, map.originalNumber)

    const description = cellAt(row, map.itemDescription)
    const quantity = parseNumberCell(cellAt(row, map.quantity)) ?? 1
    const unitPrice = parseMoneyCell(cellAt(row, map.unitPrice), inPence)

    // A document with a total but no line description is still worth keeping:
    // treat it as a single summary line so the money is not lost.
    const hasAnyContent =
      description !== "" ||
      unitPrice !== null ||
      cellAt(row, map.customerName) !== "" ||
      documentDate !== null

    const warnings: string[] = []
    let error: string | null = null

    if (!documentDate) error = "No invoice/quote date found in this row"
    else if (originalNumber === "" && description === "" && unitPrice === null) {
      error = "Row has no document number, description or price"
    }

    if (unitPrice === null && description !== "") {
      warnings.push("No unit price on this line")
    }

    // Quantities are stored as whole numbers, so flag anything that would round.
    if (!Number.isInteger(quantity) && (description !== "" || unitPrice !== null)) {
      warnings.push(
        `Quantity ${quantity} will be rounded to ${Math.max(1, Math.round(quantity))}`
      )
    }

    const lineTotal = unitPrice === null ? 0 : Math.round(unitPrice * quantity)

    const status = normaliseStatus(
      cellAt(row, map.status),
      kind,
      kind === "invoice" && paidDate !== null
    )

    // A later line for the same document refines the shared fields, so only
    // fill in blanks rather than overwriting the first row's values.
    const key = originalNumber ? originalNumber.toLowerCase() : `row-${rowNumber}`
    const existing = originalNumber ? byNumber.get(key) : undefined

    if (existing) {
      if (existing.error === null) {
        if (!existing.documentDate && documentDate) existing.documentDate = documentDate
        if (!existing.sentDate && sentDate) existing.sentDate = sentDate
        if (!existing.dueDate && dueDate) existing.dueDate = dueDate
        if (!existing.paidDate && paidDate) existing.paidDate = paidDate
        if (!existing.acceptedDate && acceptedDate) existing.acceptedDate = acceptedDate
        if (!existing.validUntil && validUntil) existing.validUntil = validUntil
        if (!existing.status && status) existing.status = status
        if (!existing.customerName) existing.customerName = cellAt(row, map.customerName)
        if (!existing.customerEmail) existing.customerEmail = cellAt(row, map.customerEmail)
        if (!existing.customerCompany) existing.customerCompany = cellAt(row, map.customerCompany)
        if (!existing.title) existing.title = cellAt(row, map.title)
        if (!existing.notes) existing.notes = cellAt(row, map.notes)
      }

      if (!error && (description !== "" || unitPrice !== null)) {
        existing.items.push({
          description: description || "Imported line",
          quantity,
          unitPrice: unitPrice ?? 0,
          total: lineTotal,
        })
        existing.warnings.push(...warnings)
      }
      return
    }

    const draft: ImportDraft = {
      rowNumber,
      sourceFile: options.sourceFile,
      originalNumber,
      customerName: cellAt(row, map.customerName),
      customerEmail: cellAt(row, map.customerEmail),
      customerCompany: cellAt(row, map.customerCompany),
      title: cellAt(row, map.title),
      documentDate,
      sentDate,
      dueDate,
      paidDate,
      acceptedDate,
      validUntil,
      status,
      items:
        description !== "" || unitPrice !== null
          ? [
              {
                description: description || "Imported line",
                quantity,
                unitPrice: unitPrice ?? 0,
                total: lineTotal,
              },
            ]
          : [],
      notes: cellAt(row, map.notes),
      currency: cellAt(row, map.currency) || options.defaultCurrency || "GBP",
      warnings,
      error: error ?? (!hasAnyContent ? "Row is empty" : null),
    }

    if (originalNumber) byNumber.set(key, draft)
    drafts.push(draft)
  })

  return { drafts, headers }
}