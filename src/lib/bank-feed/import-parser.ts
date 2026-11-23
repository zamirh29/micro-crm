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

function parseDate(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }
  const slash = raw.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})$/)
  if (slash) {
    const day = Number(slash[1])
    const month = Number(slash[2])
    let year = Number(slash[3])
    if (year < 100) year += 2000
    const isoDay = String(day).padStart(2, "0")
    const isoMonth = String(month).padStart(2, "0")
    // Statements from UK banks normally use DD/MM/YYYY.
    return `${year}-${isoMonth}-${isoDay}`
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function splitCsv(text: string): string[][] {
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
    } else if (char === ",") {
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

function findColumn(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header.trim().toLowerCase()))
}

function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[£$,\s]/g, "")
  if (!cleaned) return null
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

export function parseCsvStatement(
  text: string,
  fileName: string
): ParsedStatement {
  const rows = splitCsv(text)
  if (rows.length < 2) return { provider: "csv", rows: [], skipped: 0 }

  const headers = rows[0].map((header) => header.replace(/^\ufeff/, ""))
  const dateCol = findColumn(headers, ["date", "posted date", "booked date", "transaction date"])
  const descriptionCol = findColumn(headers, ["description", "details", "narrative", "merchant", "payee"])
  const amountCol = findColumn(headers, ["amount", "value", "transaction amount"])
  const debitCol = findColumn(headers, ["debit", "money out", "paid out"])
  const creditCol = findColumn(headers, ["credit", "money in", "paid in"])
  const typeCol = findColumn(headers, ["type", "transaction type"])

  if (dateCol < 0 || descriptionCol < 0 || (amountCol < 0 && debitCol < 0 && creditCol < 0)) {
    return { provider: "csv", rows: [], skipped: rows.length - 1 }
  }

  const parsed: NormalisedBankTransaction[] = []
  let skipped = 0
  for (const cells of rows.slice(1, 2001)) {
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
  return { provider: "csv", rows: parsed, skipped }
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
  return { provider: "ofx", rows: parsed, skipped }
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
