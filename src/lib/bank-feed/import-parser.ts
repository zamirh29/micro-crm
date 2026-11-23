import { createHash } from "crypto"
import type { BankFeedProvider, NormalisedBankTransaction } from "@/lib/bank-feed/types"

export interface ParsedStatement {
  provider: "csv" | "ofx"
  rows: NormalisedBankTransaction[]
  skipped: number
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

/**
 * Bank exports often contain two identical-looking rows (same date, payee and
 * amount). They are separate transactions, so give each occurrence its own
 * stable ID instead of sending duplicate conflict keys to Postgres.
 */
function makeIdsUnique(
  rows: NormalisedBankTransaction[]
): NormalisedBankTransaction[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const base = row.normalisedProviderTransactionId
    const ordinal = (seen.get(base) ?? 0) + 1
    seen.set(base, ordinal)
    if (ordinal === 1) return row
    const id = `${base}-${ordinal}`
    return {
      ...row,
      providerTransactionId:
        row.providerTransactionId === base ? id : row.providerTransactionId,
      normalisedProviderTransactionId: id,
      metadata: { ...row.metadata, duplicateOrdinal: ordinal },
    }
  })
}

function canonicalHeader(value: string): string {
  return value
    .replace(/^\ufeff/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function parseDate(value: string): string | null {
  const raw = value.trim().replace(/\u00a0/g, " ")
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }

  const numeric = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (numeric) {
    const day = Number(numeric[1])
    const month = Number(numeric[2])
    let year = Number(numeric[3])
    if (year < 100) year += 2000
    if (day < 1 || day > 31 || month < 1 || month > 12) return null
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }
  const named = raw.match(/^(\d{1,2})[\s-]([a-z]{3,})[\s-](\d{2,4})$/i)
  if (named) {
    const month = months[named[2].slice(0, 3).toLowerCase()]
    const day = Number(named[1])
    let year = Number(named[3])
    if (year < 100) year += 2000
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function countDelimiter(line: string, delimiter: string): number {
  let count = 0
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') i += 1
      else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      count += 1
    }
  }
  return count
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  let best = ","
  let bestCount = -1
  for (const delimiter of [",", ";", "\t", "|"]) {
    const count = countDelimiter(firstLine, delimiter)
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

function splitCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(field.trim())
      field = ""
    } else if (char === "\n") {
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ""
    } else if (char !== "\r") {
      field += char
    }
  }
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

const DATE_NAMES = [
  "date", "transactiondate", "transdate", "posteddate", "postingdate",
  "bookeddate", "bookingdate", "valuedate", "statementdate", "dateposted",
  "postdate", "paymentdate", "effective date", "effectivedate",
].map(canonicalHeader)

const DESCRIPTION_NAMES = [
  "description", "transactiondescription", "transactiondetails", "details",
  "narrative", "merchant", "payee", "reference", "paymentreference",
  "particulars", "transactionnarrative", "descriptionnarrative", "memo",
].map(canonicalHeader)

const AMOUNT_NAMES = [
  "amount", "amountgbp", "transactionamount", "transactionamountgbp",
  "value", "amountvalue", "amountsterling",
].map(canonicalHeader)

const DEBIT_NAMES = [
  "debit", "debitamount", "debitgbp", "moneyout", "moneyoutgbp", "paidout",
  "paidoutgbp", "withdrawal", "withdrawals", "outgoing", "out", "spend",
].map(canonicalHeader)

const CREDIT_NAMES = [
  "credit", "creditamount", "creditgbp", "moneyin", "moneyingbp", "paidin",
  "paidingbp", "deposit", "deposits", "incoming", "in", "received",
].map(canonicalHeader)

const TYPE_NAMES = [
  "type", "transactiontype", "txntype", "transactioncategory",
].map(canonicalHeader)

function findColumn(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(canonicalHeader(header)))
}

function parseAmount(value: string): number | null {
  let cleaned = value
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/[\s£$€]/g, "")
    .replace(/^(GBP|USD|EUR)\s*/i, "")
    .replace(/\s*(GBP|USD|EUR)$/i, "")
  if (!cleaned) return null

  let negative = false
  if (/^\(.*\)$/.test(cleaned)) {
    negative = true
    cleaned = cleaned.slice(1, -1)
  }
  if (cleaned.startsWith("-")) {
    negative = true
    cleaned = cleaned.slice(1)
  }
  if (/^\d+(\.\d+)?-$/.test(cleaned)) {
    negative = true
    cleaned = cleaned.replace(/-$/, "")
  }

  const hasComma = cleaned.includes(",")
  const hasDot = cleaned.includes(".")
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".")
    } else {
      cleaned = cleaned.replace(/,/g, "")
    }
  } else if (hasComma) {
    const parts = cleaned.split(",")
    if (parts.length === 2 && /^\d{1,2}$/.test(parts[1])) {
      cleaned = `${parts[0].replace(/\./g, "")}.${parts[1]}`
    } else {
      cleaned = cleaned.replace(/,/g, "")
    }
  }

  const number = Number(cleaned)
  if (!Number.isFinite(number)) return null
  return negative ? -Math.abs(number) : number
}

export function parseCsvStatement(
  text: string,
  fileName: string
): ParsedStatement {
  const rows = splitCsv(text)
  if (rows.length < 2) return { provider: "csv", rows: [], skipped: 0 }

  let headerIndex = -1
  let headers: string[] = []
  const scanLimit = Math.min(rows.length, 25)
  for (let i = 0; i < scanLimit; i += 1) {
    const candidate = rows[i]
    const hasDate = findColumn(candidate, DATE_NAMES) >= 0
    const hasDescription = findColumn(candidate, DESCRIPTION_NAMES) >= 0
    const hasAmount =
      findColumn(candidate, AMOUNT_NAMES) >= 0 ||
      findColumn(candidate, DEBIT_NAMES) >= 0 ||
      findColumn(candidate, CREDIT_NAMES) >= 0
    if (hasDate && hasDescription && hasAmount) {
      headerIndex = i
      headers = candidate
      break
    }
  }
  if (headerIndex < 0) return { provider: "csv", rows: [], skipped: rows.length - 1 }

  const dateCol = findColumn(headers, DATE_NAMES)
  const descriptionCol = findColumn(headers, DESCRIPTION_NAMES)
  const amountCol = findColumn(headers, AMOUNT_NAMES)
  const debitCol = findColumn(headers, DEBIT_NAMES)
  const creditCol = findColumn(headers, CREDIT_NAMES)
  const typeCol = findColumn(headers, TYPE_NAMES)

  const parsed: NormalisedBankTransaction[] = []
  let skipped = 0
  const dataRows = rows.slice(headerIndex + 1, headerIndex + 2001)
  skipped += Math.max(0, rows.length - (headerIndex + 1) - dataRows.length)

  for (const cells of dataRows) {
    const date = parseDate(cells[dateCol] ?? "")
    const description = (cells[descriptionCol] ?? "").trim()
    let amount: number | null = null
    if (amountCol >= 0) amount = parseAmount(cells[amountCol] ?? "")
    if (amount === null && debitCol >= 0 && cells[debitCol]) {
      amount = -Math.abs(parseAmount(cells[debitCol]) ?? 0)
    }
    if (amount === null && creditCol >= 0 && cells[creditCol]) {
      amount = Math.abs(parseAmount(cells[creditCol]) ?? 0)
    }
    if (!date || !description || amount === null) {
      skipped += 1
      continue
    }
    const type = (typeCol >= 0 ? cells[typeCol] ?? "" : "").toLowerCase()
    const direction: NormalisedBankTransaction["direction"] = type.includes("transfer")
      ? "transfer"
      : amount >= 0
        ? "money_in"
        : "money_out"
    const id = hash(`${fileName}|${date}|${description}|${amount}`)
    parsed.push({
      providerTransactionId: id,
      normalisedProviderTransactionId: id,
      bookedAt: `${date}T12:00:00.000Z`,
      description,
      amount,
      direction,
      currency: "GBP",
      balance: null,
      categoryHint: null,
      supplierHint: description,
      metadata: { source: "csv", fileName },
    })
  }
  return { provider: "csv", rows: makeIdsUnique(parsed), skipped }
}

function ofxTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return match?.[1]?.trim() ?? null
}

export function parseOfxStatement(text: string, fileName: string): ParsedStatement {
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []
  const parsed: NormalisedBankTransaction[] = []
  let skipped = 0

  for (const block of blocks.slice(0, 2000)) {
    const fitId = ofxTag(block, "FITID")
    const rawDate = ofxTag(block, "DTPOSTED")
    const rawAmount = ofxTag(block, "TRNAMT")
    const date = rawDate ? parseDate(rawDate) : null
    const amount = rawAmount ? parseAmount(rawAmount) : null
    const name = ofxTag(block, "NAME")
    const memo = ofxTag(block, "MEMO")
    const description = [name, memo].filter(Boolean).join(" ").trim()
    if (!date || amount === null || !description) {
      skipped += 1
      continue
    }
    const type = (ofxTag(block, "TRNTYPE") ?? "").toLowerCase()
    const direction: NormalisedBankTransaction["direction"] = type.includes("transfer")
      ? "transfer"
      : amount >= 0
        ? "money_in"
        : "money_out"
    const id = fitId ? hash(`${fileName}|${fitId}`) : hash(`${fileName}|${date}|${description}|${amount}`)
    parsed.push({
      providerTransactionId: fitId ?? id,
      normalisedProviderTransactionId: id,
      bookedAt: `${date}T12:00:00.000Z`,
      description,
      amount,
      direction,
      currency: "GBP",
      balance: null,
      categoryHint: null,
      supplierHint: name ?? description,
      metadata: { source: "ofx", fileName },
    })
  }
  return { provider: "ofx", rows: makeIdsUnique(parsed), skipped }
}

export function parseBankStatement(
  text: string,
  fileName: string
): ParsedStatement {
  const provider: BankFeedProvider = /\.ofx$/i.test(fileName) || /<OFX>/i.test(text)
    ? "ofx"
    : "csv"
  return provider === "ofx"
    ? parseOfxStatement(text, fileName)
    : parseCsvStatement(text, fileName)
}
