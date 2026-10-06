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
// Printed forms
// ---------------------------------------------------------------------------

/**
 * Header row produced by `formToTable`.
 *
 * A printed invoice has no tabular shape at all: labels float above their
 * values and the line items sit in a free-text block. Rather than teach the
 * rest of the pipeline a second representation, a recognised form is rewritten
 * into this ordinary layout and then flows through column detection, drafting,
 * re-mapping and committing exactly like a CSV export would.
 */
export const FORM_HEADERS = [
  "Invoice Number",
  "Invoice Date",
  "Client Name",
  "Client Email",
  "Title",
  "Description",
  "Qty",
  "Unit Price",
  "Status",
  "Notes",
] as const

/**
 * True for a grid `formToTable` produced.
 *
 * The review screen posts its grid back to re-map the columns, by which point
 * the original form is gone. The header row is the only way to know the money
 * cells were read as major units, so a re-parse cannot rescale them.
 */
export function isFormTable(grid: string[][]): boolean {
  const head = grid[0]
  if (!head || head.length !== FORM_HEADERS.length) return false
  return FORM_HEADERS.every((header, index) => (head[index] ?? "").trim() === header)
}

const FORM_NUMBER_LABEL = /^(invoice|quote)\s*#:\s*$/i
const FORM_DATE_LABEL = /^date:\s*$/i
const FORM_SUBTOTAL_LABEL = /^sub\s?total$/i
const FORM_LINE_HEADER = /^description$/i
const FORM_TOTAL_COLUMN = /^total$/i

/**
 * Labels a value scan must not read past.
 *
 * On these forms a value sits to the right of its label in a merged run of
 * cells, so the scan skips repeated copies of the label it started on and
 * stops at any *other* label. Without this an empty Email cell would pick up
 * the Registration value sitting beside it.
 */
const FORM_BLOCK_LABELS: RegExp[] = [
  /^name$/i,
  /^address$/i,
  /^city,?\s*postcode$/i,
  /^phone$/i,
  /^email$/i,
  /^client #:\s*$/i,
  /^bill to$/i,
  /^vehicle info\.?$/i,
  /^make$/i,
  /^model$/i,
  /^colou?r$/i,
  /^year$/i,
  /^mileage$/i,
  /^registration$/i,
  FORM_LINE_HEADER,
  /^notes:\s*$/i,
  FORM_SUBTOTAL_LABEL,
  /^vat$/i,
  /^delivery$/i,
  /^total due$/i,
  FORM_TOTAL_COLUMN,
  /^paid$/i,
]

/**
 * Collapse whitespace runs, including the non-breaking spaces Excel hides
 * inside names, so the same customer matches no matter which cell it came from.
 */
function squashText(value: string): string {
  return value.replace(/[\s\u00a0]+/g, " ").trim()
}

/** A section heading on the form, e.g. `Work carried out:`. */
function isFormHeading(text: string): boolean {
  return /:\s*$/.test(text)
}

function findFormCell(
  grid: string[][],
  pattern: RegExp,
  fromRow: number,
  toRow: number = grid.length
): { row: number; col: number } | null {
  const last = Math.min(toRow, grid.length)
  for (let row = fromRow; row < last; row++) {
    const cells = grid[row]
    for (let col = 0; col < cells.length; col++) {
      if (pattern.test(cells[col].trim())) return { row, col }
    }
  }
  return null
}

function formValueAfter(row: string[], index: number, same: RegExp): string {
  for (let col = index + 1; col < row.length; col++) {
    const cell = row[col].trim()
    if (!cell || same.test(cell)) continue
    if (FORM_BLOCK_LABELS.some((label) => label.test(cell))) return ""
    return cell
  }
  return ""
}

function moneyLabel(amount: number): string {
  return (amount / 100).toFixed(2)
}

/**
 * Rewrite a printed invoice form into a tabular grid, or return null when the
 * sheet is not one.
 *
 * A sheet that *looks* like a form but cannot be read safely throws instead. A
 * form that silently drops line items or mis-reads a total is far worse than
 * one the upload reports as unreadable alongside the files that did parse.
 */
export function formToTable(grid: string[][]): string[][] | null {
  if (grid.length < 4) return null

  // The banner row is the fastest tell, but on its own it is far too common:
  // an ordinary sheet can quite reasonably have an "Invoice" column header.
  // The number and subtotal labels are what make this a printed form.
  const banner = (grid[0] ?? []).map((cell) => cell.trim().toLowerCase())
  if (!banner.includes("invoice") && !banner.includes("quote")) return null
  if (!findFormCell(grid, FORM_NUMBER_LABEL, 1)) return null
  if (!findFormCell(grid, FORM_SUBTOTAL_LABEL, 1)) return null

  const lineHeader = findFormCell(grid, FORM_LINE_HEADER, 1)
  if (!lineHeader) {
    throw new Error("That printed form has no line-item block (no Description row)")
  }
  const headerRow = lineHeader.row

  const subtotalCell = findFormCell(grid, FORM_SUBTOTAL_LABEL, headerRow)
  if (!subtotalCell) {
    throw new Error("That printed form has no SUBTOTAL row below its line items")
  }

  const read = (pattern: RegExp, from: number, to: number, what: string): string => {
    const hit = findFormCell(grid, pattern, from, to)
    if (!hit) throw new Error(`That printed form has no ${what} label`)
    return formValueAfter(grid[hit.row], hit.col, pattern)
  }
  const peek = (pattern: RegExp, from: number, to: number): string => {
    const hit = findFormCell(grid, pattern, from, to)
    return hit ? formValueAfter(grid[hit.row], hit.col, pattern) : ""
  }

  // --- document header ---------------------------------------------------

  const originalNumber = squashText(read(FORM_NUMBER_LABEL, 1, headerRow, "invoice number"))
  if (!originalNumber) throw new Error("That printed form has no invoice number")

  const documentDate = parseDateCell(read(FORM_DATE_LABEL, 1, headerRow, "date"))
  if (!documentDate) throw new Error("That printed form has no readable invoice date")

  const customerName = squashText(peek(/^name$/i, 1, headerRow))
  const customerEmail = squashText(peek(/^email$/i, 1, headerRow))
  const address = squashText(peek(/^address$/i, 1, headerRow))
  const city = squashText(peek(/^city,?\s*postcode$/i, 1, headerRow))
  const phone = squashText(peek(/^phone$/i, 1, headerRow))
  const make = squashText(peek(/^make$/i, 1, headerRow))
  const model = squashText(peek(/^model$/i, 1, headerRow))
  const colour = squashText(peek(/^colou?r$/i, 1, headerRow))
  const year = squashText(peek(/^year$/i, 1, headerRow))
  const registration = squashText(peek(/^registration$/i, 1, headerRow))
  const mileage = squashText(peek(/^mileage$/i, 1, headerRow))

  // --- totals ------------------------------------------------------------

  const totalsFrom = subtotalCell.row
  const subtotal = parseMoneyCell(read(FORM_SUBTOTAL_LABEL, totalsFrom, grid.length, "SUBTOTAL"), false)
  if (subtotal === null) {
    throw new Error("That printed form has no readable SUBTOTAL")
  }

  // Tax is applied once per import, not per invoice, so a form carrying its
  // own VAT would import at the wrong figure with no way to say otherwise.
  const vat = parseMoneyCell(peek(/^vat$/i, totalsFrom, grid.length), false)
  if (vat) {
    throw new Error("That printed form includes VAT, which the importer cannot apply per invoice")
  }

  const deliveryRaw = squashText(peek(/^delivery$/i, totalsFrom, grid.length))
  const delivery = parseMoneyCell(deliveryRaw, false)
  const total = parseMoneyCell(peek(FORM_TOTAL_COLUMN, totalsFrom, grid.length), false)
  if (delivery && total !== null && subtotal + delivery !== total) {
    throw new Error("That printed form's TOTAL does not equal its SUBTOTAL plus DELIVERY")
  }

  // --- line items --------------------------------------------------------

  const descCol = lineHeader.col
  const totalCol = findFormCell(grid, FORM_TOTAL_COLUMN, headerRow, headerRow + 1)?.col
  if (totalCol === undefined) {
    throw new Error("That printed form has no Total column beside its Description column")
  }

  const lines: { price: string | null; text: string }[] = []
  for (let row = headerRow + 1; row < subtotalCell.row; row++) {
    const text = squashText(grid[row]?.[descCol] ?? "")
    const priceCell = squashText(grid[row]?.[totalCol] ?? "")
    const price = parseMoneyCell(priceCell, false) === null ? null : priceCell
    if (!text && price === null) continue
    lines.push({ price, text })
  }

  const itemsSum = lines.reduce((sum, line) => {
    if (line.price === null) return sum
    return sum + (parseMoneyCell(line.price, false) ?? 0)
  }, 0)
  if (itemsSum !== subtotal) {
    throw new Error(
      `That printed form's line items add up to ${moneyLabel(itemsSum)} but its SUBTOTAL is ${moneyLabel(subtotal)}`
    )
  }

  // A heading carrying its own price adopts the unpriced lines beneath it, so
  // `Work carried out:` reads as the work rather than as a bare label.
  const absorbed = new Set<number>()
  lines.forEach((line, index) => {
    if (line.price === null || !isFormHeading(line.text)) return
    const details: string[] = []
    for (let next = index + 1; next < lines.length; next++) {
      const following = lines[next]
      if (following.price !== null) break
      details.push(following.text)
      absorbed.add(next)
    }
    if (details.length > 0) line.text = details.join("; ")
  })

  // Everything still unpriced is narrative the form could not bill for, so it
  // is preserved as notes rather than invented as zero-price line items.
  const noteLines: string[] = []
  let run: string[] = []
  const flushRun = () => {
    // A heading with nothing under it (`Repairs carried out to:`) is a layout
    // artefact of the printed form rather than anything worth keeping.
    run.forEach((line, index) => {
      const following = run[index + 1]
      if (isFormHeading(line) && (!following || isFormHeading(following))) return
      noteLines.push(line)
    })
    run = []
  }
  lines.forEach((line, index) => {
    if (absorbed.has(index)) return
    if (line.price !== null) {
      flushRun()
      return
    }
    run.push(line.text)
  })
  flushRun()

  // --- title and notes ---------------------------------------------------

  // The registration is how a body shop identifies a job, and unlike the work
  // description it is present and stable on every form.
  const vehicle = squashText([registration, make, model].filter(Boolean).join(" "))
  const fallbackTitle =
    lines.find((line) => line.price !== null && !isFormHeading(line.text))?.text ||
    lines.find((line) => line.price === null && !isFormHeading(line.text))?.text ||
    ""
  const title = vehicle || fallbackTitle

  const infoLines: string[] = []
  const addressLine = [address, city].filter(Boolean).join(", ")
  if (addressLine) infoLines.push(`Address: ${squashText(addressLine)}`)
  if (phone) infoLines.push(`Phone: ${phone}`)
  const vehicleLine = [
    colour,
    year && `year ${year}`,
    mileage && `mileage ${mileage}`,
  ].filter(Boolean)
  if (vehicleLine.length > 0) infoLines.push(`Vehicle: ${vehicleLine.join(", ")}`)
  const notes = [...infoLines, ...noteLines].join("\n")

  const grandTotal = total ?? subtotal
  const paid = parseMoneyCell(peek(/^paid$/i, totalsFrom, grid.length), false)
  const status = paid !== null && paid > 0 && paid >= grandTotal ? "paid" : ""

  // --- synthetic grid ----------------------------------------------------

  const items = lines.filter((line): line is { price: string; text: string } => line.price !== null)
  if (delivery) items.push({ price: deliveryRaw, text: "Delivery" })
  if (items.length === 0) {
    items.push({ price: "", text: fallbackTitle || "Imported line" })
  }

  const rows: string[][] = [[...FORM_HEADERS]]
  items.forEach((item) => {
    rows.push([
      originalNumber,
      documentDate,
      customerName,
      customerEmail,
      title,
      item.text || "Imported line",
      "1",
      item.price,
      status,
      notes,
    ])
  })

  // Identity belongs on the first row only; the number and date repeat on
  // every row because a later line without a date is dropped as unimportable.
  for (let index = 2; index < rows.length; index++) {
    const row = rows[index]
    row[2] = ""
    row[3] = ""
    row[4] = ""
    row[8] = ""
    row[9] = ""
  }

  return rows
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