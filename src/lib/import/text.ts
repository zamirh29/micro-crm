/**
 * Turn plain text from a PDF or an OCR scan into the tabular grid the import
 * wizard already understands.
 *
 * PDF text extraction and OCR both produce lines of text, not cells. The
 * importer's review screen needs columns, so this module finds the line-item
 * table, lifts the document header (number, date, customer), and rebuilds the
 * same `TEXT_HEADERS` shape a spreadsheet would have. Nothing here writes to
 * the database, and nothing is committed automatically: the user still reviews
 * every row.
 *
 * Text extraction is inherently fuzzy, so this parser is deliberately
 * conservative. When it cannot find a date, a customer or any priced line it
 * throws with a message the wizard can show, rather than inventing values that
 * would corrupt the ledger.
 */

import { parseDateCell, parseMoneyCell, parseNumberCell } from "./parse"

/**
 * Columns this module emits.
 *
 * The names match the aliases `autoDetectColumns` already knows, so a PDF or
 * photo lands on the review screen fully mapped. `isTextTable` is how a
 * re-parse knows these values are major units, not pence.
 */
export const TEXT_HEADERS = [
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

export function isTextTable(grid: string[][]): boolean {
  const head = grid[0]
  if (!head || head.length !== TEXT_HEADERS.length) return false
  return TEXT_HEADERS.every((header, index) => (head[index] ?? "").trim() === header)
}

interface DocumentMeta {
  originalNumber: string
  documentDate: string
  customerName: string
  customerEmail: string
  status: string
}

interface PricedLine {
  description: string
  quantity: number
  /** Major units, e.g. 120.5 for £120.50. */
  unitPrice: number
}

interface ColumnRoles {
  description: number
  quantity: number
  unit: number
  amount: number
}

const DESC_HEADER = /\b(description|item|items|product|service|details|particulars)\b/i
const AMOUNT_HEADER = /\b(amount|total|price|value|net|charge|cost)\b/i
const QTY_HEADER = /\b(qty|quantity|hours|units|nos)\b/i
const UNIT_HEADER = /\b(unit|rate)\b/i

// A money token needs a decimal part, a thousands separator or a currency
// symbol. A bare "2" is far more likely to be a quantity, and treating it as
// money silently turns a £2 line into £2.00.
const MONEY_CELL =
  /^(?:[£$€]\s*)?\(?-?(?:\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})\)?$/
const MONEY_AT_END = /((?:[£$€]\s*)?\(?-?(?:\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})\)?)\s*$/

// Labels that end a line-item table. Anchored on the whole first cell (after
// trimming money) so a genuine line such as "Total service package" survives.
const STOP_LABEL =
  /^(?:sub\s*-?\s*total|total(?:\s+(?:due|amount|inc(?:luding)?\s+vat|ex(?:cluding)?\s+vat))?|amount\s+due|grand\s+total|balance(?:\s+due)?|vat(?:\s+(?:at\s+)?\d+(?:\.\d+)?%?)?|tax(?:\s+(?:at\s+)?\d+(?:\.\d+)?%?)?|delivery|shipping|discount|payment\s+terms|terms\s*(?:&|and)\s*conditions|notes?|thank\s*you)(?:\s*\([A-Z]{3}\))?$/i

const INVOICE_NUMBER_LABELS = [
  /^\s*(?:tax\s+)?invoice\s*(?:no\.?|number|num|#|ref(?:erence)?)\s*[:#\-–]?\s*/i,
  /^\s*(?:quote|quotation)\s*(?:no\.?|number|num|#|ref(?:erence)?)\s*[:#\-–]?\s*/i,
  /^\s*(?:credit\s+note|document|doc)\s*(?:no\.?|number|num|#)\s*[:#\-–]?\s*/i,
]

const DATE_LABEL = /\b(?:invoice|quote|issue|issued|document)?\s*date\b/i
const EMAIL_LABEL = /^\s*e-?mail\s*[:#\-–]?\s*/i
const STATUS_LABEL = /^\s*(?:payment\s+)?status\s*[:#\-–]?\s*/i

const CUSTOMER_LABELS = [
  /^\s*(?:bill(?:ed)?\s*to|invoice\s+to|sold\s+to|customer|client|account\s+name)\s*[:#\-–]?\s*/i,
]

const DATE_TOKEN =
  /\b(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+\d{2,4}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4})\b/i

function squash(value: string): string {
  return value.replace(/[\s\u00a0]+/g, " ").trim()
}

function splitCells(line: string): string[] {
  return line
    .trim()
    .split(/ {2,}/)
    .map((cell) => cell.trim())
    .filter(Boolean)
}

function looksLikeMoney(cell: string): boolean {
  return MONEY_CELL.test(cell.trim())
}

function money(cell: string): number | null {
  if (!looksLikeMoney(cell)) return null
  return parseMoneyCell(cell, false)
}

function normaliseLines(text: string): string[] {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .split("\n")
    // A tab is a column separator in extracted PDF text. Four spaces keeps it
    // visible to splitCells while never being mistaken for a word gap.
    .map((line) => line.replace(/\t/g, "    ").replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0)
}

/** True when a line is a heading repeated at the top of a new page. */
function isRepeatedHeader(cells: string[]): boolean {
  if (cells.length < 2) return false
  const joined = cells.join(" ").toLowerCase()
  return DESC_HEADER.test(joined) && (AMOUNT_HEADER.test(joined) || QTY_HEADER.test(joined))
}

function findHeader(lines: string[]): { index: number; cells: string[] } | null {
  let best: { index: number; cells: string[]; score: number } | null = null
  const limit = Math.min(lines.length, 80)

  for (let index = 0; index < limit; index++) {
    const line = lines[index]
    if (line.length > 220) continue
    if (!DESC_HEADER.test(line)) continue

    const cells = splitCells(line)
    let score = 2
    if (AMOUNT_HEADER.test(line)) score += 2
    if (QTY_HEADER.test(line)) score += 1
    if (UNIT_HEADER.test(line)) score += 1

    // A totals row also contains "total"/"amount"; it must not win.
    if (/^\s*(sub\s*-?\s*total|total|vat|amount\s+due|balance)/i.test(line)) score -= 3
    if (score < 4) continue

    if (!best || score > best.score) best = { index, cells, score }
  }

  return best ? { index: best.index, cells: best.cells } : null
}

function columnRoles(cells: string[]): ColumnRoles {
  if (cells.length < 2) {
    return { description: -1, quantity: -1, unit: -1, amount: -1 }
  }

  const lower = cells.map((cell) => cell.toLowerCase().replace(/\s+/g, " ").trim())
  const find = (...patterns: RegExp[]): number =>
    lower.findIndex((cell) => patterns.some((pattern) => pattern.test(cell)))

  return {
    description: find(/\b(desc|item|product|service|detail|particular)/),
    quantity: find(/\b(qty|quantity|hours|units|nos)/),
    unit: find(/\b(unit\s*price|price|rate|unit)/),
    amount: find(/\b(amount|line\s*total|total|value|net)\b/),
  }
}

function isStopLine(cells: string[]): boolean {
  const first = (cells[0] ?? "").trim()
  if (STOP_LABEL.test(first)) return true
  // OCR may lose the column gap, leaving "TOTAL 620.00" in a single cell.
  return cells.length === 1 && STOP_LABEL.test(first.replace(MONEY_AT_END, "").trim())
}

function stripTrailingMoney(value: string): string {
  return value.replace(MONEY_AT_END, "").trim()
}

/** Pick the most description-like cell when the mapped one is empty/numeric. */
function pickDescription(
  cells: string[],
  roles: ColumnRoles,
  quantity: number | null
): string {
  const mapped = roles.description >= 0 ? cells[roles.description] ?? "" : ""
  if (
    mapped &&
    !looksLikeMoney(mapped) &&
    !/^\d{1,4}(?:\.\d+)?$/.test(mapped.trim())
  ) {
    return stripTrailingMoney(mapped)
  }

  const quantityText = quantity === null ? "" : String(quantity)
  const candidates = cells
    .map((cell) => cell.trim())
    .filter((cell) => {
      if (!cell || looksLikeMoney(cell)) return false
      if (/^\d{1,4}(?:\.\d+)?$/.test(cell)) return false
      if (quantityText && cell === quantityText) return false
      return true
    })
    .sort((a, b) => b.length - a.length)

  return stripTrailingMoney(candidates[0] ?? "")
}

function parseDataRow(
  cells: string[],
  roles: ColumnRoles,
  headerCount: number
): PricedLine | null {
  let amount: number | null = null
  let unit: number | null = null
  let quantity: number | null = null

  if (headerCount >= 2 && cells.length === headerCount) {
    quantity = parseNumberCell(cells[roles.quantity] ?? "")
    unit = money(cells[roles.unit] ?? "")
    amount = money(cells[roles.amount] ?? "")
  } else {
    // Columns did not line up with the header: use the trailing money cell as
    // the line amount and the last bare number before it as the quantity.
    const amountIndex = cells.reduce(
      (last, cell, index) => (looksLikeMoney(cell) ? index : last),
      -1
    )
    if (amountIndex >= 0) amount = money(cells[amountIndex])

    const before = cells.slice(0, amountIndex >= 0 ? amountIndex : cells.length)
    for (let index = before.length - 1; index >= 0; index--) {
      const value = before[index].trim()
      if (!looksLikeMoney(value) && /^\d{1,4}(?:\.\d+)?$/.test(value)) {
        quantity = parseNumberCell(value)
        break
      }
    }

    if (roles.unit >= 0 && roles.unit < cells.length) {
      unit = money(cells[roles.unit] ?? "")
    }
  }

  const description = pickDescription(cells, roles, quantity)
  if (!description || description.length < 2) return null

  const qty = quantity !== null && quantity > 0 ? quantity : 1

  if (unit === null && amount !== null) {
    unit = amount / qty
  }
  if (unit === null || !Number.isFinite(unit)) return null
  if (unit < 0) return null

  return {
    description: squash(description),
    quantity: Math.max(1, Math.round(qty)),
    // parseMoneyCell returns pence; the grid stores major units.
    unitPrice: Math.round(unit) / 100,
  }
}

/** A line with no column spacing at all, e.g. OCR output. */
function parseLooseLine(line: string): PricedLine | null {
  let rest = line.trim()
  if (!rest) return null

  const amountMatch = rest.match(MONEY_AT_END)
  if (!amountMatch) return null
  const amount = parseMoneyCell(amountMatch[1], false)
  if (amount === null) return null
  rest = rest.slice(0, amountMatch.index).trim()

  // A line often carries three numbers: qty, unit price and line amount.
  let unit: number | null = null
  const unitMatch = rest.match(MONEY_AT_END)
  if (unitMatch) {
    unit = parseMoneyCell(unitMatch[1], false)
    rest = rest.slice(0, unitMatch.index).trim()
  }

  let quantity = 1
  const quantityMatch = rest.match(/(?:^|\s)(\d{1,4}(?:\.\d+)?)\s*$/)
  if (quantityMatch) {
    quantity = Number(quantityMatch[1]) || 1
    rest = rest.slice(0, quantityMatch.index).trim()
  }

  const description = squash(rest)
  if (!description || description.length < 2) return null

  const unitPrice = unit ?? amount / quantity
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return null

  return {
    description,
    quantity: Math.max(1, Math.round(quantity)),
    // parseMoneyCell returns pence; the grid stores major units.
    unitPrice: Math.round(unitPrice) / 100,
  }
}

function tableItems(
  lines: string[],
  header: { index: number; cells: string[] }
): PricedLine[] {
  const roles = columnRoles(header.cells)
  const headerCount = header.cells.length
  const items: PricedLine[] = []

  for (let index = header.index + 1; index < lines.length; index++) {
    const line = lines[index]
    const cells = splitCells(line)

    if (isRepeatedHeader(cells)) continue
    if (isStopLine(cells)) break

    // Page footers are common and carry no billable value.
    if (/^\s*page\s+\d+(?:\s+of\s+\d+)?\s*$/i.test(line)) continue

    const item =
      cells.length >= 2 ? parseDataRow(cells, roles, headerCount) : parseLooseLine(line)
    if (item) items.push(item)
  }

  return items
}

/**
 * Fallback for documents without a recognisable table header.
 *
 * Any line ending in a money amount below a "Description"/"Item" landmark is
 * treated as a line item. This is how most OCR output of a simple invoice
 * reads, and it is still bounded by the same date/customer requirements.
 */
function looseItems(lines: string[]): PricedLine[] {
  const start = lines.findIndex((line) => /^\s*(?:description|item|work\s+carried|details)\b/i.test(line))
  const from = start >= 0 ? start + 1 : 0
  const items: PricedLine[] = []

  for (let index = from; index < lines.length; index++) {
    const cells = splitCells(lines[index])
    if (isStopLine(cells)) break
    if (isRepeatedHeader(cells)) continue

    const item = parseLooseLine(lines[index])
    if (item) items.push(item)
  }

  return items
}

function nextValueLine(lines: string[], from: number): string {
  for (let index = from; index < Math.min(lines.length, from + 4); index++) {
    const value = lines[index].trim()
    if (!value) continue
    if (/^[A-Za-z][A-Za-z .#/&-]{0,24}[:#\-–]\s*$/.test(value)) continue
    return value
  }
  return ""
}

function findLabelValue(lines: string[], labels: RegExp[], allowNextLine: boolean): string {
  for (let index = 0; index < Math.min(lines.length, 60); index++) {
    for (const label of labels) {
      const match = lines[index].match(label)
      if (!match) continue
      const inline = lines[index].slice(match[0].length).trim()
      if (inline) return inline
      if (allowNextLine) {
        const next = nextValueLine(lines, index + 1)
        if (next) return next
      }
    }
  }
  return ""
}

function findDocumentNumber(lines: string[]): string {
  for (let index = 0; index < Math.min(lines.length, 40); index++) {
    for (const label of INVOICE_NUMBER_LABELS) {
      const match = lines[index].match(label)
      if (!match) continue
      let value = lines[index].slice(match[0].length).trim()
      if (!value) value = nextValueLine(lines, index + 1)
      value = value.replace(/^[:\-#–\s]+/, "").trim()
      if (/^[A-Za-z0-9][A-Za-z0-9._/&-]{0,39}$/.test(value)) return value
    }
  }
  return ""
}

function findDocumentDate(lines: string[]): string {
  // Prefer a line that actually says "date"; only then accept the first
  // date-looking token, so a line-item description cannot supply it.
  for (let index = 0; index < Math.min(lines.length, 60); index++) {
    if (!DATE_LABEL.test(lines[index])) continue
    const token = lines[index].match(DATE_TOKEN)
    const parsed = token ? parseDateCell(token[1]) : null
    if (parsed) return parsed
    const next = nextValueLine(lines, index + 1)
    const nextToken = next.match(DATE_TOKEN)
    const nextParsed = nextToken ? parseDateCell(nextToken[1]) : null
    if (nextParsed) return nextParsed
  }

  for (let index = 0; index < Math.min(lines.length, 40); index++) {
    const token = lines[index].match(DATE_TOKEN)
    const parsed = token ? parseDateCell(token[1]) : null
    if (parsed) return parsed
  }

  return ""
}

function findCustomerName(lines: string[]): string {
  let value = findLabelValue(lines, CUSTOMER_LABELS, true)

  // The app's own printed forms label the customer block simply "Name". It is
  // only a last resort, because a company letterhead may use the same word.
  if (!value) {
    for (let index = 0; index < Math.min(lines.length, 40); index++) {
      const match = lines[index].match(/^\s*(?:customer\s+)?name\s*[:#\-–]?\s*$/i)
      if (!match) continue
      value = nextValueLine(lines, index + 1)
      if (value) break
    }
  }

  const cleaned = squash(value).replace(/[,;]+$/, "")
  return cleaned.length <= 120 ? cleaned : cleaned.slice(0, 120)
}

function findCustomerEmail(lines: string[]): string {
  const labelled = findLabelValue(lines, [EMAIL_LABEL], false)
  const candidate = labelled || lines.join(" ").match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || ""
  return candidate.trim().length <= 160 ? candidate.trim() : ""
}

function findStatus(lines: string[]): string {
  const value = findLabelValue(lines, [STATUS_LABEL], false).toLowerCase()
  if (/\bpaid\b/.test(value) && !/unpaid|not paid|part/.test(value)) return "paid"
  if (/\boverdue\b/.test(value)) return "overdue"
  if (/\bdraft\b/.test(value)) return "draft"
  if (/\bsent|issued|unpaid|awaiting\b/.test(value)) return "sent"
  return ""
}

function fallbackNumber(fallback: string | undefined, date: string): string {
  const base = (fallback ?? "").replace(/\.[^.]+$/, "").trim()
  if (base) return base.slice(0, 60)
  return `IMPORTED-${date}`
}

/**
 * Convert extracted text into a `TEXT_HEADERS` grid.
 *
 * @param text Plain text from a PDF text layer or an OCR pass.
 * @param options.fallbackNumber Reference used when the document has no visible
 * number. The file name is a useful, stable substitute.
 */
export function textToGrid(
  text: string,
  options: { fallbackNumber?: string } = {}
): string[][] {
  const lines = normaliseLines(text)
  if (lines.length === 0) {
    throw new Error("That file has no readable text")
  }

  const header = findHeader(lines)
  let items = header ? tableItems(lines, header) : []
  if (items.length === 0) items = looseItems(lines)

  if (items.length === 0) {
    throw new Error(
      "No priced line items could be found. If this is a scan, use the photo option; otherwise check the PDF is a text-based invoice."
    )
  }

  const documentDate = findDocumentDate(lines)
  if (!documentDate) {
    throw new Error(
      "Could not find an invoice or quote date in that file. Upload the original spreadsheet, or use a clearer copy."
    )
  }

  const customerName = findCustomerName(lines)
  if (!customerName) {
    throw new Error(
      "Could not find a customer name. Check the file has a Bill To or Customer block, or import the spreadsheet instead."
    )
  }

  const meta: DocumentMeta = {
    originalNumber: findDocumentNumber(lines) || fallbackNumber(options.fallbackNumber, documentDate),
    documentDate,
    customerName,
    customerEmail: findCustomerEmail(lines),
    status: findStatus(lines),
  }

  const rows: string[][] = [[...TEXT_HEADERS]]
  items.forEach((item, index) => {
    rows.push([
      meta.originalNumber,
      meta.documentDate,
      // Identity belongs on the first row only; the number and date repeat so
      // a later line without a date is still grouped with its document.
      index === 0 ? meta.customerName : "",
      index === 0 ? meta.customerEmail : "",
      "",
      item.description,
      String(item.quantity),
      item.unitPrice.toFixed(2),
      index === 0 ? meta.status : "",
      "",
    ])
  })

  return rows
}
